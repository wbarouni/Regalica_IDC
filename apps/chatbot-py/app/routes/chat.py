"""POST /chat/message — Regalica orchestration entry point (Phase 3 minimal).

This route is the single conversational boundary between the user
and REGFlow. The flow is:

  1. Read the active prompt from `prompt_bank` for the bearer
     `(tenant_id, agent_type, function_name)`. Phase 3 minimal
     defaults to `regalica/aggregate_zoom_fail` (the "Q-type 1"
     aggregator from doc 10 §5). Phase 3-bis will replace the
     hard-defaulted bearer with a real router/planner pipeline.
  2. If no active prompt exists, return an explicit fallback
     message — the operator must promote a draft prompt via
     4-yeux to enable LLM responses.
  3. Build an `LLMRequest` using the prompt parameters and
     delegate to `LLMClient.complete()`.
  4. Persist the conversation (creating a new one if absent) and
     the message with full traceability (tokens, latency, agent
     identifier).
  5. Return the canonical `ChatResponse` consumed by the frontend.

Zero hardcoding: every parameter (template, temperature, max
tokens, thinking flag, model) flows from `prompt_bank`. The route
contains only the orchestration glue.
"""

from __future__ import annotations

from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.config import settings
from app.llm.base import LLMClient, LLMRequest
from app.services.prompt_loader import load_active_prompt

router = APIRouter()

# Persisted role identifier for messages produced by Regalica
# (per migration 032 ck_msg_role enum).
_REGALICA_RESPONSE_ROLE = "regalica_response"

# Default conversation language (per migration 031 ck_language enum).
# Phase 3-bis surfaces this on the request body.
_DEFAULT_LANGUAGE = "fr"

_NO_ACTIVE_PROMPT_MESSAGE = (
    "Aucun prompt actif pour cet agent — "
    "une promotion 4-yeux est requise pour passer un prompt de draft à active."
)


class ChatContext(BaseModel):
    """Optional contextual hints attached to a chat turn."""

    validation_run_id: str | None = None
    arrete_date: str | None = None
    annexes_in_scope: list[str] | None = None


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


@router.post("/message", response_model=ChatResponse)
async def post_chat_message(
    chat_request: ChatRequest,
    pool: Annotated[asyncpg.Pool, Depends(get_pool)],
    llm_client: Annotated[LLMClient, Depends(get_llm_client)],
) -> ChatResponse:
    """Handle a single chat turn: load prompt, call LLM, persist, respond."""
    bearer_agent_type = settings.chatbot_default_agent_type
    bearer_function_name = settings.chatbot_default_function_name
    bearer_key = f"{bearer_agent_type}/{bearer_function_name}"

    prompt_meta = await load_active_prompt(
        pool=pool,
        tenant_id=chat_request.tenant_id,
        agent_type=bearer_agent_type,
        function_name=bearer_function_name,
    )

    if prompt_meta is None:
        conversation_id = chat_request.conversation_id or await _ensure_conversation(
            pool=pool,
            existing_id=None,
            tenant_id=chat_request.tenant_id,
            user_id=chat_request.user_id,
        )
        message_id = await _persist_message(
            pool=pool,
            tenant_id=chat_request.tenant_id,
            conversation_id=conversation_id,
            content=_NO_ACTIVE_PROMPT_MESSAGE,
            agent_id=bearer_key,
            tokens_input=0,
            tokens_output=0,
            tokens_thinking=0,
            latency_ms=0,
        )
        return ChatResponse(
            conversation_id=conversation_id,
            message_id=message_id,
            thinking_trace=None,
            response_markdown=_NO_ACTIVE_PROMPT_MESSAGE,
            agents_called=[],
            tokens_input=0,
            tokens_output=0,
            tokens_thinking=0,
            latency_ms=0,
        )

    llm_request = LLMRequest(
        prompt=chat_request.message,
        temperature=prompt_meta["temperature"],
        max_tokens=prompt_meta["max_tokens"],
        thinking_enabled=prompt_meta["thinking_enabled"],
        system_prompt=prompt_meta["template"],
    )

    try:
        llm_response = await llm_client.complete(llm_request)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LLM completion failed: {exc}",
        ) from exc

    conversation_id = await _ensure_conversation(
        pool=pool,
        existing_id=chat_request.conversation_id,
        tenant_id=chat_request.tenant_id,
        user_id=chat_request.user_id,
    )
    message_id = await _persist_message(
        pool=pool,
        tenant_id=chat_request.tenant_id,
        conversation_id=conversation_id,
        content=llm_response.content,
        agent_id=bearer_key,
        tokens_input=llm_response.tokens_input,
        tokens_output=llm_response.tokens_output,
        tokens_thinking=llm_response.tokens_thinking,
        latency_ms=llm_response.latency_ms,
    )

    return ChatResponse(
        conversation_id=conversation_id,
        message_id=message_id,
        thinking_trace=llm_response.thinking_trace,
        response_markdown=llm_response.content,
        agents_called=[bearer_key],
        tokens_input=llm_response.tokens_input,
        tokens_output=llm_response.tokens_output,
        tokens_thinking=llm_response.tokens_thinking,
        latency_ms=llm_response.latency_ms,
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
