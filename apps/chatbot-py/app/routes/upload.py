"""POST /upload — T0 pipeline kickoff (commit 41c).

Called by the API's POST /api/tenants/:tenantId/runs as a fire-and-
forget HTTP request once a validation_run has been created. The
route reads the workflow grammar from `workflow_steps` (phase='T0'),
runs each deterministic agent in order, then renders the
regalica/xml_received prompt to produce the user-facing briefing.

Doctrine compliance:
  - The pipeline order lives in workflow_steps, not in this file.
    Reordering / disabling a step is a (056 + seed amendment)
    operation; this code reads `agent_type` + `function_name` and
    dispatches to a Python callable via a static map (no if/elif
    on business values, no string match in the loop body).
  - The Regalica briefing prompt is loaded from prompt_bank via
    the existing prompt_loader; template / temperature / model all
    come from DB. Zero literal LLM key, zero literal model id here.
  - The settings.api_url + settings.jwt_secret values needed for
    Phase-3 follow-ups (engine fail-details / message persist) are
    read from the operator-controlled env (REGFLOW_API_URL +
    JWT_SECRET) and validated at startup by Pydantic.
"""

from __future__ import annotations

import time
import zlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated, Any, NamedTuple

import asyncpg
import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.agents.base import AgentResult
from app.agents.t0_dependency import DependencyAgent
from app.agents.t0_ingestor import IngestorXMLAgent
from app.agents.t0_temporal import TemporalAgent
from app.clients.regflow_api import RegflowApiClient, RegflowApiError
from app.config import settings
from app.llm.base import LLMClient, LLMRequest
from app.logger import get_logger
from app.routes.chat import get_llm_client, get_pool
from app.services.prompt_loader import load_active_prompt

router = APIRouter()
log = get_logger(__name__)

# Default arrete periodicity assumed by the temporal agent when the
# upload payload doesn't carry one. Quarterly is the BCT majority
# case; the field will land on the kickoff payload in Phase 3-bis.
_DEFAULT_ARRETE_TYPE = "quarterly"


class UploadKickoffRequest(BaseModel):
    """Body posted by the API when a new validation_run is created."""

    run_id: str = Field(min_length=1)
    primary_upload_id: str = Field(min_length=1)
    upload_ids: list[str] = Field(min_length=1)
    arrete_date: str = Field(min_length=1)
    tenant_id: str = Field(min_length=1)
    # Optional. When the frontend's chat dock has already opened a
    # conversation prior to the run, it threads the conversation_id
    # here so the T0 briefing can be persisted into that thread via
    # the engine API. Absent => briefing is returned in the response
    # only (the synchronous path that already exists).
    conversation_id: str | None = Field(default=None, min_length=1)


def get_engine_client() -> RegflowApiClient:
    """FastAPI dependency that yields a fresh engine client per request."""
    return RegflowApiClient()


class UploadStepReport(BaseModel):
    """One workflow_steps entry's execution report."""

    step_order: int
    agent_type: str
    function_name: str
    success: bool
    latency_ms: int
    error: str | None = None
    output: dict[str, Any] = Field(default_factory=dict)


class UploadBriefing(BaseModel):
    """Regalica-rendered user-facing briefing."""

    message: str
    agents_triggered: list[str]


class UploadResponse(BaseModel):
    """POST /upload response body."""

    status: str
    run_id: str
    steps: list[UploadStepReport]
    briefing: UploadBriefing | None = None


class _StepRow(NamedTuple):
    """One row from workflow_steps WHERE phase='T0'."""

    step_order: int
    agent_type: str
    function_name: str


class _RunContext(NamedTuple):
    """Shared inputs passed to every agent dispatcher."""

    pool: asyncpg.Pool
    tenant_id: str
    primary_upload_id: str
    upload_ids: list[str]
    arrete_date: str


# ---------------------------------------------------------------------
# Agent dispatch — `agent_type` is the canonical lookup key. Each
# entry knows how to extract the args from the shared _RunContext +
# the previous step's output. Adding a new T0 agent is a (workflow
# seed + dispatch entry) change — no change to the route loop.
# ---------------------------------------------------------------------

AgentRunner = Callable[
    [_RunContext, dict[str, Any]],
    Awaitable[AgentResult],
]


async def _run_ingestor_xml(ctx: _RunContext, _shared: dict[str, Any]) -> AgentResult:
    xml_content = await _load_upload_content(ctx.pool, ctx.primary_upload_id, ctx.tenant_id)
    return await IngestorXMLAgent().ingest(xml_content)


async def _run_dependency(ctx: _RunContext, shared: dict[str, Any]) -> AgentResult:
    primary_annexe = shared.get("primary_annexe")
    if not isinstance(primary_annexe, str) or primary_annexe == "":
        return AgentResult(
            agent_name=DependencyAgent.name,
            success=False,
            error="missing primary_annexe from previous step",
        )
    available = await _load_upload_annexes(ctx.pool, ctx.upload_ids, ctx.tenant_id)
    return await DependencyAgent().check(
        primary_annexe=primary_annexe,
        available_annexes=available,
        pool=ctx.pool,
        tenant_id=ctx.tenant_id,
    )


async def _run_temporal(ctx: _RunContext, _shared: dict[str, Any]) -> AgentResult:
    return await TemporalAgent().validate(
        arrete_date=ctx.arrete_date,
        arrete_type=_DEFAULT_ARRETE_TYPE,
    )


_DISPATCH: dict[str, AgentRunner] = {
    "ingestor_xml": _run_ingestor_xml,
    "dependency": _run_dependency,
    "temporal": _run_temporal,
}


async def _load_upload_content(
    pool: asyncpg.Pool,
    upload_id: str,
    tenant_id: str,
) -> str:
    """Fetch xml_uploads row, decompress, return UTF-8 text."""
    row = await pool.fetchrow(
        """
        SELECT content_compressed, compression_algo, encoding_detected
          FROM xml_uploads
         WHERE id = $1::uuid AND tenant_id = $2::uuid AND deleted_at IS NULL
        """,
        upload_id,
        tenant_id,
    )
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"upload {upload_id} not found for tenant",
        )
    algo = str(row["compression_algo"])
    blob: bytes = bytes(row["content_compressed"])
    encoding = str(row["encoding_detected"]) or "utf-8"
    if algo == "gzip":
        decompressed = zlib.decompress(blob, wbits=zlib.MAX_WBITS + 16)
    elif algo == "raw":
        decompressed = blob
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"unsupported compression_algo '{algo}' for upload {upload_id}",
        )
    return decompressed.decode(encoding)


async def _load_upload_annexes(
    pool: asyncpg.Pool,
    upload_ids: list[str],
    tenant_id: str,
) -> list[str]:
    """Resolve every upload's code_annexe in one query."""
    rows = await pool.fetch(
        """
        SELECT code_annexe
          FROM xml_uploads
         WHERE id = ANY($1::uuid[]) AND tenant_id = $2::uuid AND deleted_at IS NULL
        """,
        upload_ids,
        tenant_id,
    )
    return [str(r["code_annexe"]) for r in rows]


async def _seed_run_agent_steps(
    pool: asyncpg.Pool,
    *,
    run_id: str,
    tenant_id: str,
    steps: list[_StepRow],
) -> dict[tuple[str, str], str]:
    """Insert one run_agent_steps row per T0 step (status=pending) and
    return a {(agent_type, function_name): step_id} lookup so the
    transition notifications can address the right row.

    The INSERT is ON CONFLICT DO NOTHING and the SELECT is unconditional
    so re-entry of /upload (e.g. after a partial failure + retry by the
    operator) reuses the existing rows without duplicating them.
    """
    async with pool.acquire() as conn:
        await conn.executemany(
            """
            INSERT INTO run_agent_steps
                (run_id, tenant_id, agent_type, function_name, ordinal, status)
            VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'pending')
            ON CONFLICT (run_id, agent_type, function_name) DO NOTHING
            """,
            [(run_id, tenant_id, s.agent_type, s.function_name, s.step_order) for s in steps],
        )
        rows = await conn.fetch(
            """
            SELECT id, agent_type, function_name
              FROM run_agent_steps
             WHERE run_id = $1::uuid AND tenant_id = $2::uuid
               AND deleted_at IS NULL
            """,
            run_id,
            tenant_id,
        )
    return {(str(r["agent_type"]), str(r["function_name"])): str(r["id"]) for r in rows}


async def _safe_notify_step(
    engine: RegflowApiClient,
    *,
    run_id: str,
    step_id: str,
    tenant_id: str,
    new_status: str,
    started_at: str | None = None,
    completed_at: str | None = None,
    error_message: str | None = None,
) -> None:
    """Best-effort notify_agent_step.

    The /upload synchronous response (UploadResponse) is the source of
    truth for the operator; the engine SSE animation is a UX nicety.
    Swallow + log a notify failure rather than aborting the whole T0
    pipeline because the workspace ribbon would not animate.
    """
    try:
        await engine.notify_agent_step(
            run_id=run_id,
            step_id=step_id,
            tenant_id=tenant_id,
            new_status=new_status,
            started_at=started_at,
            completed_at=completed_at,
            error_message=error_message,
        )
    except (RegflowApiError, httpx.HTTPError) as err:
        log.warning(
            "engine_notify_agent_step_failed",
            run_id=run_id,
            step_id=step_id,
            new_status=new_status,
            error=str(err),
        )


async def _load_t0_steps(pool: asyncpg.Pool) -> list[_StepRow]:
    """Read the active T0 sequence ordered by step_order."""
    rows = await pool.fetch(
        """
        SELECT step_order, agent_type, function_name
          FROM workflow_steps
         WHERE phase = 'T0' AND is_active = TRUE AND deleted_at IS NULL
         ORDER BY step_order
        """,
    )
    return [
        _StepRow(
            step_order=int(r["step_order"]),
            agent_type=str(r["agent_type"]),
            function_name=str(r["function_name"]),
        )
        for r in rows
    ]


def _propagate_outputs(shared: dict[str, Any], step: _StepRow, result: AgentResult) -> None:
    """Promote a few well-known outputs into the shared context dict."""
    if not result.success:
        return
    if step.agent_type == "ingestor_xml":
        annexe = result.output.get("code_annexe")
        if isinstance(annexe, str) and annexe != "":
            shared["primary_annexe"] = annexe


async def _render_briefing(
    pool: asyncpg.Pool,
    llm_client: LLMClient,
    tenant_id: str,
    payload: UploadKickoffRequest,
    shared: dict[str, Any],
) -> UploadBriefing | None:
    """Load briefing prompt and call the LLM. None on miss."""
    meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=settings.chatbot_briefing_agent_type,
        function_name=settings.chatbot_briefing_function_name,
    )
    if meta is None:
        return None
    primary_annexe = shared.get("primary_annexe", "")
    rendered = (
        meta["template"]
        .replace("{upload_id}", payload.primary_upload_id)
        .replace("{filename}", "")
        .replace("{annexe_code}", str(primary_annexe))
        .replace("{arrete_date}", payload.arrete_date)
    )
    response = await llm_client.complete(
        LLMRequest(
            prompt=rendered,
            temperature=meta["temperature"],
            max_tokens=meta["max_tokens"],
            thinking_enabled=meta["thinking_enabled"],
        ),
    )
    triggered_raw = shared.get("post_t0_agents", [])
    triggered: list[str] = (
        [str(s) for s in triggered_raw] if isinstance(triggered_raw, list) else []
    )
    return UploadBriefing(
        message=response.content.strip(),
        agents_triggered=triggered,
    )


@router.post("", response_model=UploadResponse)
async def post_upload(
    payload: UploadKickoffRequest,
    pool: Annotated[asyncpg.Pool, Depends(get_pool)],
    llm_client: Annotated[LLMClient, Depends(get_llm_client)],
    engine: Annotated[RegflowApiClient, Depends(get_engine_client)],
) -> UploadResponse:
    """Run the T0 pipeline + the Regalica briefing for one validation_run.

    For each T0 step the route calls the REGFlow API engine to (a) flip
    the row's status (current -> done|error) AND (b) emit the matching
    SSE frame so the workspace ribbon animates in real time. The
    notify call is best-effort: a failure on the engine side does not
    abort the local pipeline because the synchronous response below is
    the authoritative result.

    The conversation_id field is optional. When present, the rendered
    briefing is also persisted into that conversation via the engine's
    /conversations/<id>/messages endpoint so the user-facing chat
    thread shows the message instead of having to extract it from the
    /upload response.
    """
    try:
        steps = await _load_t0_steps(pool)
        if not steps:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="workflow_steps T0 catalogue is empty",
            )

        step_ids = await _seed_run_agent_steps(
            pool,
            run_id=payload.run_id,
            tenant_id=payload.tenant_id,
            steps=steps,
        )

        ctx = _RunContext(
            pool=pool,
            tenant_id=payload.tenant_id,
            primary_upload_id=payload.primary_upload_id,
            upload_ids=payload.upload_ids,
            arrete_date=payload.arrete_date,
        )
        shared: dict[str, Any] = {}
        reports: list[UploadStepReport] = []
        for step in steps:
            runner = _DISPATCH.get(step.agent_type)
            if runner is None:
                reports.append(
                    UploadStepReport(
                        step_order=step.step_order,
                        agent_type=step.agent_type,
                        function_name=step.function_name,
                        success=False,
                        latency_ms=0,
                        error=(
                            f"no python dispatcher registered for agent_type '{step.agent_type}'"
                        ),
                    )
                )
                break

            step_id = step_ids.get((step.agent_type, step.function_name))
            started_at = datetime.now(UTC).isoformat()
            if step_id is not None:
                await _safe_notify_step(
                    engine,
                    run_id=payload.run_id,
                    step_id=step_id,
                    tenant_id=payload.tenant_id,
                    new_status="current",
                    started_at=started_at,
                )

            start = time.monotonic()
            result = await runner(ctx, shared)
            latency = int((time.monotonic() - start) * 1000)
            completed_at = datetime.now(UTC).isoformat()

            reports.append(
                UploadStepReport(
                    step_order=step.step_order,
                    agent_type=step.agent_type,
                    function_name=step.function_name,
                    success=result.success,
                    latency_ms=latency or result.latency_ms,
                    error=result.error,
                    output=result.output,
                )
            )
            _propagate_outputs(shared, step, result)

            if step_id is not None:
                await _safe_notify_step(
                    engine,
                    run_id=payload.run_id,
                    step_id=step_id,
                    tenant_id=payload.tenant_id,
                    new_status="done" if result.success else "error",
                    started_at=started_at,
                    completed_at=completed_at,
                    error_message=result.error,
                )

            if not result.success:
                break

        briefing: UploadBriefing | None = None
        if all(r.success for r in reports):
            briefing = await _render_briefing(
                pool=pool,
                llm_client=llm_client,
                tenant_id=payload.tenant_id,
                payload=payload,
                shared=shared,
            )
            if briefing is not None and payload.conversation_id is not None:
                try:
                    await engine.persist_message(
                        conversation_id=payload.conversation_id,
                        tenant_id=payload.tenant_id,
                        content=briefing.message,
                        role="assistant",
                        metadata={
                            "agents_triggered": briefing.agents_triggered,
                            "run_id": payload.run_id,
                        },
                        produced_by_agent=settings.chatbot_briefing_agent_type,
                        run_id=payload.run_id,
                    )
                except (RegflowApiError, httpx.HTTPError) as err:
                    log.warning(
                        "engine_persist_briefing_failed",
                        run_id=payload.run_id,
                        conversation_id=payload.conversation_id,
                        error=str(err),
                    )

        final_status = "t0_complete" if all(r.success for r in reports) else "t0_failed"
        return UploadResponse(
            status=final_status,
            run_id=payload.run_id,
            steps=reports,
            briefing=briefing,
        )
    finally:
        await engine.aclose()
