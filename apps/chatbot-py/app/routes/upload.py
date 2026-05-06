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

import json
import time
import zlib
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Annotated, Any, NamedTuple

import asyncpg
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.agents.base import AgentResult
from app.agents.t0_dependency import DependencyAgent
from app.agents.t0_ingestor import IngestorXMLAgent
from app.agents.t0_temporal import TemporalAgent
from app.clients.regflow_api import RegflowApiClient, RegflowApiError
from app.config import settings
from app.domain.error_resolver import ErrorResolver
from app.exceptions import T1RejectionError
from app.llm.base import LLMClient, LLMRequest
from app.logger import get_logger
from app.routes.chat import get_error_resolver, get_llm_client, get_pool
from app.services.orchestrator import (
    _build_finalize_payload_completed,
    _build_finalize_payload_failed,
    _build_synthesis_artifact,
    _clean_thought_leakage,
    _run_t1_validation,
)
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
        pool=ctx.pool,
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
    elif step.agent_type == "dependency":
        # Sprint C — Point 4 — surface the dependency check output to
        # the briefing renderer so Regalica can react to the missing
        # companion situation. The DependencyAgent.output shape:
        #   {primary_annexe, required: [...], missing: [...], autonomous: bool}
        # Only the three fields the briefing prompt consumes leak into
        # `shared` to keep the dict surface small.
        shared["dependency_required"] = result.output.get("required", [])
        shared["dependency_missing"] = result.output.get("missing", [])
        shared["dependency_autonomous"] = bool(result.output.get("autonomous", False))


async def _finalize_t0_failure_best_effort(
    *,
    engine: RegflowApiClient,
    error_resolver: ErrorResolver | None,
    correlation_id: str | None,
    run_id: str,
    tenant_id: str,
    failing_agent_type: str,
) -> None:
    """POST /finalize with status='failed' for a T0 step failure.

    Tranche 0 single-writer pattern: only /finalize can sortie a
    validation_runs row from status='running'. Without this call, a
    T0 KO would leave the run pinned at 'running' indefinitely.

    Best-effort: a /finalize failure (Node down, network) is logged
    but never re-raised — the synchronous UploadResponse remains the
    operator-facing source of truth, and a future retry from any path
    will resolve cleanly thanks to the canonical-diff idempotence.
    """
    if error_resolver is None:
        log.warning(
            "skip_finalize_t0_failure_no_resolver",
            run_id=run_id,
            failing_agent_type=failing_agent_type,
        )
        return
    try:
        error_code = error_resolver.from_t0_agent(failing_agent_type)
        payload: dict[str, Any] = {
            "status": "failed",
            "totals": None,
            "fail_items": [],
            "duration_ms": 0,
            "step1_xsd_status": None,
            "step1_xsd_duration_ms": None,
            "step2_embedded_status": None,
            "step2_embedded_duration_ms": None,
            "step3_rdg_status": None,
            "step3_rdg_duration_ms": None,
            "error_code": error_code,
            "synthesis_artifact": None,
        }
        await engine.finalize_run(
            run_id=run_id,
            tenant_id=tenant_id,
            payload=payload,
            correlation_id=correlation_id,
        )
    except Exception as err:
        log.warning(
            "finalize_t0_failure_post_failed",
            run_id=run_id,
            failing_agent_type=failing_agent_type,
            error=str(err),
        )


def _format_dependency_list(items: list[Any]) -> str:
    """Render a list of dependency entries as a comma-separated annexe code list.

    Each entry is the dict produced by `DependencyAgent.check`:
    `{annexe_code, dependency_type, source_circulaire, source_article}`.
    Returns "(aucun)" when the list is empty so the rendered briefing
    prompt never carries a bare empty placeholder.
    """
    if not items:
        return "(aucun)"
    codes: list[str] = []
    for item in items:
        if isinstance(item, dict):
            code = item.get("annexe_code")
            if isinstance(code, str) and code != "":
                codes.append(code)
    return ", ".join(codes) if codes else "(aucun)"


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
    # Sprint C — Point 4 — propagate the DependencyAgent output into the
    # briefing prompt so Regalica's narrative can name missing companions
    # and acknowledge multi-XML coherence. The placeholders below are
    # silently no-op when the prompt template does not reference them
    # (str.replace returns the input unchanged on a missing substring).
    required_codes = _format_dependency_list(shared.get("dependency_required", []))
    missing_codes = _format_dependency_list(shared.get("dependency_missing", []))
    autonomous = "true" if shared.get("dependency_autonomous", False) else "false"
    rendered = (
        meta["template"]
        .replace("{upload_id}", payload.primary_upload_id)
        .replace("{filename}", "")
        .replace("{annexe_code}", str(primary_annexe))
        .replace("{arrete_date}", payload.arrete_date)
        .replace("{required_companions}", required_codes)
        .replace("{missing_companions}", missing_codes)
        .replace("{autonomous}", autonomous)
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


async def _render_t1_synthesis(
    *,
    pool: asyncpg.Pool,
    llm_client: LLMClient,
    tenant_id: str,
    t1_result: Any,
) -> str | None:
    """Tranche 1.2 — invoke regalica/aggregate_t1_result on the T1
    output to produce the user-facing synthesis markdown.

    Mirrors the chat-driven path's _invoke_t1_synthesis_aggregator but
    is local to /upload so the LANCER button (no chat in flight) still
    delivers a proper Regalica narration. Best-effort: returns None on
    LLM error / missing prompt; caller treats None as
    synthesis_artifact=null and the front falls back to the KPI grid
    + FailsTable as primary surface.
    """
    meta = await load_active_prompt(
        pool=pool,
        tenant_id=tenant_id,
        agent_type=settings.chatbot_t1_aggregator_agent_type,
        function_name=settings.chatbot_t1_aggregator_function_name,
    )
    if meta is None:
        log.info(
            "synthesis_aggregator_prompt_missing",
            tenant_id=tenant_id,
        )
        return None

    totals = t1_result["totals"]
    pass_count = int(totals["pass_"])
    fail_severe = int(totals["fail_severe"])
    fail_rounding = int(totals["fail_rounding"])
    payload: dict[str, Any] = {
        "user_message": "",
        "intent_type": "launch_validation",
        "specialist_outputs": [
            {
                "bearer": "regalica/aggregate_t1_result",
                "success": True,
                "output": {
                    "success": True,
                    "total_fail_severe": fail_severe,
                    "total_fail_rounding": fail_rounding,
                    "total_pass": pass_count,
                    "duration_ms": int(t1_result["duration_ms"]),
                    "rejection_step": None,
                    "rejection_reason": None,
                },
                "error": None,
            },
        ],
    }
    try:
        request = LLMRequest(
            prompt=json.dumps(payload, ensure_ascii=False),
            temperature=meta["temperature"],
            max_tokens=meta["max_tokens"],
            thinking_enabled=meta["thinking_enabled"],
            system_prompt=meta["template"],
        )
        response = await llm_client.complete(request)
        raw = response.content
        cleaned = _clean_thought_leakage(raw) if meta.get("output_contract") == "string" else raw
        if not isinstance(cleaned, str):
            return None
        stripped = cleaned.strip()
        return stripped if stripped else None
    except Exception as exc:
        log.warning("synthesis_aggregator_failed", error=str(exc))
        return None


@router.post("", response_model=UploadResponse)
async def post_upload(
    payload: UploadKickoffRequest,
    request: Request,
    pool: Annotated[asyncpg.Pool, Depends(get_pool)],
    llm_client: Annotated[LLMClient, Depends(get_llm_client)],
    engine: Annotated[RegflowApiClient, Depends(get_engine_client)],
    error_resolver: Annotated[ErrorResolver | None, Depends(get_error_resolver)],
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
                # Tranche 0 D5 — single-writer terminal write on T0 KO.
                # POST /finalize with status='failed' so the run row
                # transitions out of 'running' and the SSE error frame
                # fires for the workspace ribbon. Best-effort: a
                # finalize POST failure is logged but never raised, the
                # synchronous /upload response remains the source of
                # truth for the operator.
                await _finalize_t0_failure_best_effort(
                    engine=engine,
                    error_resolver=error_resolver,
                    correlation_id=getattr(request.state, "correlation_id", None),
                    run_id=payload.run_id,
                    tenant_id=payload.tenant_id,
                    failing_agent_type=step.agent_type,
                )
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

        # Tranche 1.2 — auto-chain T0 → T1 → /finalize so a successful
        # T0 always produces verdicts and KPIs without requiring the
        # operator to type "lance la validation" in the chat. The chat-
        # driven path (router LLM → launch_validation intent) remains
        # available as a manual override; this block makes the LANCER
        # button a single-click end-to-end action.
        #
        # Gated by CHATBOT_AUTO_T1_AFTER_T0 (default true): tests opt
        # out via fixture so existing T0-only assertions stay valid.
        #
        # Failure handling:
        #   - T1RejectionError (engine missed required T0 step OR
        #     /evaluate timed out) → /finalize with status='failed' and
        #     the appropriate error_code from the resolver.
        #   - Any other exception (network, JSON, etc.) → /finalize with
        #     status='failed' + error_code='t1_engine_exception'.
        # Both paths ensure the run row leaves status='running' so the
        # workspace ribbon stops showing an indefinite spinner.
        t1_status: str | None = None
        if settings.chatbot_auto_t1_after_t0 and all(r.success for r in reports):
            try:
                t1_result = await _run_t1_validation(
                    pool=pool,
                    run_id=payload.run_id,
                    tenant_id=payload.tenant_id,
                    api_client=engine,
                )
                # Tranche 1.2 — invoke the Regalica synthesis aggregator
                # so /finalize lands a real markdown synthesis_artifact
                # (rendered by Workspace as <Artefact type="livrable_a">)
                # AND the chat thread receives Regalica's user-facing
                # narration of the verdict. Best-effort: failures
                # downgrade gracefully to the KPI-only path.
                synthesis_markdown = await _render_t1_synthesis(
                    pool=pool,
                    llm_client=llm_client,
                    tenant_id=payload.tenant_id,
                    t1_result=t1_result,
                )
                finalize_payload = _build_finalize_payload_completed(t1_result)
                if synthesis_markdown is not None:
                    finalize_payload["synthesis_artifact"] = _build_synthesis_artifact(
                        synthesis_markdown,
                        t1_result,
                    )
                await engine.finalize_run(
                    run_id=payload.run_id,
                    tenant_id=payload.tenant_id,
                    payload=finalize_payload,
                    correlation_id=getattr(request.state, "correlation_id", None),
                )
                # Persist Regalica's synthesis as a chat message so the
                # operator sees the AI narration in the dock right after
                # the run completes (only when a conversation_id was
                # threaded by the frontend; the LANCER button passes it
                # if the user has already opened a chat conversation).
                if synthesis_markdown is not None and payload.conversation_id is not None:
                    try:
                        await engine.persist_message(
                            conversation_id=payload.conversation_id,
                            tenant_id=payload.tenant_id,
                            content=synthesis_markdown,
                            role="assistant",
                            metadata={
                                "agents_triggered": [
                                    f"{settings.chatbot_t1_aggregator_agent_type}/"
                                    f"{settings.chatbot_t1_aggregator_function_name}",
                                ],
                                "run_id": payload.run_id,
                            },
                            produced_by_agent=settings.chatbot_t1_aggregator_agent_type,
                            run_id=payload.run_id,
                        )
                    except (RegflowApiError, httpx.HTTPError) as err:
                        log.warning(
                            "engine_persist_synthesis_failed",
                            run_id=payload.run_id,
                            conversation_id=payload.conversation_id,
                            error=str(err),
                        )
                t1_status = "completed"
            except T1RejectionError as exc:
                error_code = (
                    error_resolver.from_t1_exception(exc)
                    if error_resolver is not None
                    else "t1_engine_exception"
                )
                try:
                    await engine.finalize_run(
                        run_id=payload.run_id,
                        tenant_id=payload.tenant_id,
                        payload=_build_finalize_payload_failed(error_code),
                        correlation_id=getattr(request.state, "correlation_id", None),
                    )
                except Exception as err:
                    log.warning(
                        "finalize_t1_rejection_post_failed",
                        run_id=payload.run_id,
                        error=str(err),
                    )
                t1_status = f"failed:{error_code}"
                log.warning(
                    "t1_rejected",
                    run_id=payload.run_id,
                    step=exc.step,
                    reason=exc.reason,
                )
            except Exception as exc:
                error_code = (
                    error_resolver.from_t1_exception(exc)
                    if error_resolver is not None
                    else "t1_engine_exception"
                )
                try:
                    await engine.finalize_run(
                        run_id=payload.run_id,
                        tenant_id=payload.tenant_id,
                        payload=_build_finalize_payload_failed(error_code),
                        correlation_id=getattr(request.state, "correlation_id", None),
                    )
                except Exception as err:
                    log.warning(
                        "finalize_t1_exception_post_failed",
                        run_id=payload.run_id,
                        error=str(err),
                    )
                t1_status = f"failed:{error_code}"
                log.warning("t1_engine_exception", run_id=payload.run_id, error=str(exc))

        if t1_status is not None:
            final_status = f"t0_complete_t1_{t1_status}"
        elif all(r.success for r in reports):
            final_status = "t0_complete"
        else:
            final_status = "t0_failed"
        return UploadResponse(
            status=final_status,
            run_id=payload.run_id,
            steps=reports,
            briefing=briefing,
        )
    finally:
        await engine.aclose()
