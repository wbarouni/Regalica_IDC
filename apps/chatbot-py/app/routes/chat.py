"""POST /chat/message — Regalica orchestration entry point.

The route is the single conversational boundary between the user
and REGFlow. The flow delegates the cognitive work to
`app.services.orchestrator.orchestrate()`:

  1. Orchestrator runs the Phase 3 pipeline: T0 stage (Phase 3-bis
     when XML uploads are wired), router LLM call to detect the
     intent from `prompt_bank`, dispatch to the matching T2
     specialist (Investigator / Citation / Historical) or fall
     back to a direct LLM call when the intent is `direct`.
  2. The route persists the conversation (creating a new row if
     absent) and the assistant message with full traceability
     (tokens, latency, agent identifier).
  3. Returns the canonical `ChatResponse` consumed by the
     frontend.

Zero hardcoding: every prompt template, temperature, max_tokens,
thinking flag and model identifier comes from `prompt_bank`. The
intent → specialist mapping lives in the orchestrator (protocol
grammar, not user-facing dispatch). No keyword matching anywhere.
"""

from __future__ import annotations

from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.clients.regflow_api import RegflowApiClient
from app.domain.error_resolver import ErrorResolver
from app.llm.base import LLMClient
from app.services.orchestrator import OrchestratorResult, orchestrate

router = APIRouter()

# Persisted role identifier for messages produced by Regalica
# (per migration 032 ck_msg_role enum).
_REGALICA_RESPONSE_ROLE = "regalica_response"

# Default conversation language (per migration 031 ck_language enum).
# Phase 3-bis surfaces this on the request body.
_DEFAULT_LANGUAGE = "fr"


class ChatContext(BaseModel):
    """Optional contextual hints attached to a chat turn."""

    validation_run_id: str | None = None
    arrete_date: str | None = None
    annexes_in_scope: list[str] | None = None
    fail: dict[str, Any] | None = None
    rule: dict[str, Any] | None = None


class ChatRequest(BaseModel):
    """Request body for POST /chat/message."""

    conversation_id: str | None = None
    message: str = Field(min_length=1)
    tenant_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
    context: ChatContext | None = None


class ChatResponse(BaseModel):
    """Response body for POST /chat/message."""

    conversation_id: str
    message_id: str
    thinking_trace: str | None
    response_markdown: str
    agents_called: list[str]
    tokens_input: int
    tokens_output: int
    tokens_thinking: int
    latency_ms: int


def get_pool(request: Request) -> asyncpg.Pool:
    """Return the live asyncpg pool from app.state, or 503 if absent."""
    pool: asyncpg.Pool | None = getattr(request.app.state, "db_pool", None)
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DB pool not initialised — DATABASE_URL must be set at startup",
        )
    return pool


def get_llm_client(request: Request) -> LLMClient:
    """Return the live LLM client from app.state."""
    client: LLMClient = request.app.state.llm_client
    return client


def get_api_client(request: Request) -> RegflowApiClient:
    """Return the shared engine HTTP client from app.state."""
    client: RegflowApiClient = request.app.state.api_client
    return client


def get_error_resolver(request: Request) -> ErrorResolver | None:
    """Return the run_error_codes resolver, or None when DB is absent.

    Tranche 0 wires the resolver in main.py lifespan ONLY when
    ``database_url`` is set. The chat path tolerates absence (smoke
    mode without DB) by passing None to orchestrate, which then skips
    the /finalize call and returns the chat response unchanged.
    """
    return getattr(request.app.state, "error_resolver", None)


@router.post("/message", response_model=ChatResponse)
async def post_chat_message(
    chat_request: ChatRequest,
    request: Request,
    pool: Annotated[asyncpg.Pool, Depends(get_pool)],
    llm_client: Annotated[LLMClient, Depends(get_llm_client)],
    api_client: Annotated[RegflowApiClient, Depends(get_api_client)],
    error_resolver: Annotated[ErrorResolver | None, Depends(get_error_resolver)],
) -> ChatResponse:
    """Handle a single chat turn: orchestrate, persist, respond."""
    context = chat_request.context
    # Set by CorrelationIdMiddleware (mounted in main.py before any
    # router). Always present as a UUID v4 string.
    correlation_id: str = request.state.correlation_id

    try:
        result: OrchestratorResult = await orchestrate(
            message=chat_request.message,
            tenant_id=chat_request.tenant_id,
            pool=pool,
            llm_client=llm_client,
            fail_context=context.fail if context is not None else None,
            rule_context=context.rule if context is not None else None,
            current_run_id=context.validation_run_id if context is not None else None,
            api_client=api_client,
            error_resolver=error_resolver,
            correlation_id=correlation_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Orchestration failed: {exc}",
        ) from exc

    conversation_id = await _ensure_conversation(
        pool=pool,
        existing_id=chat_request.conversation_id,
        tenant_id=chat_request.tenant_id,
        user_id=chat_request.user_id,
    )
    persisted_agent_label = (
        result.agents_called[0] if result.agents_called else "regalica/orchestrator"
    )
    message_id = await _persist_message(
        pool=pool,
        tenant_id=chat_request.tenant_id,
        conversation_id=conversation_id,
        content=result.response_markdown,
        agent_id=persisted_agent_label,
        tokens_input=result.tokens_input,
        tokens_output=result.tokens_output,
        tokens_thinking=result.tokens_thinking,
        latency_ms=result.latency_ms,
    )

    return ChatResponse(
        conversation_id=conversation_id,
        message_id=message_id,
        thinking_trace=result.thinking_trace,
        response_markdown=result.response_markdown,
        agents_called=list(result.agents_called),
        tokens_input=result.tokens_input,
        tokens_output=result.tokens_output,
        tokens_thinking=result.tokens_thinking,
        latency_ms=result.latency_ms,
    )


async def _ensure_conversation(
    pool: asyncpg.Pool,
    existing_id: str | None,
    tenant_id: str,
    user_id: str,
) -> str:
    """Return the conversation id, creating a new row when none provided."""
    if existing_id is not None:
        return existing_id
    row = await pool.fetchrow(
        """
        INSERT INTO conversations (tenant_id, user_id, language)
        VALUES ($1::uuid, $2::uuid, $3)
        RETURNING id::text AS id
        """,
        tenant_id,
        user_id,
        _DEFAULT_LANGUAGE,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create conversation row",
        )
    return str(row["id"])


async def _persist_message(
    pool: asyncpg.Pool,
    tenant_id: str,
    conversation_id: str,
    content: str,
    agent_id: str,
    tokens_input: int,
    tokens_output: int,
    tokens_thinking: int,
    latency_ms: int,
) -> str:
    """Insert one Regalica response message and return its id."""
    seq_row = await pool.fetchrow(
        """
        SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_seq
          FROM messages
         WHERE conversation_id = $1::uuid
        """,
        conversation_id,
    )
    next_seq = int(seq_row["next_seq"]) if seq_row is not None else 1

    msg_row = await pool.fetchrow(
        """
        INSERT INTO messages (
            tenant_id, conversation_id, sequence_number, role,
            content_markdown, produced_by_agent,
            tokens_input, tokens_output, tokens_thinking, latency_ms
        ) VALUES (
            $1::uuid, $2::uuid, $3, $4,
            $5, $6,
            $7, $8, $9, $10
        )
        RETURNING id::text AS id
        """,
        tenant_id,
        conversation_id,
        next_seq,
        _REGALICA_RESPONSE_ROLE,
        content,
        agent_id,
        tokens_input,
        tokens_output,
        tokens_thinking,
        latency_ms,
    )
    if msg_row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist message row",
        )
    return str(msg_row["id"])
