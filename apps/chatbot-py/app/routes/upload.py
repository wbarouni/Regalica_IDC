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
from typing import Annotated, Any, NamedTuple

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.agents.base import AgentResult
from app.agents.t0_dependency import DependencyAgent
from app.agents.t0_ingestor import IngestorXMLAgent
from app.agents.t0_temporal import TemporalAgent
from app.config import settings
from app.llm.base import LLMClient, LLMRequest
from app.routes.chat import get_llm_client, get_pool
from app.services.prompt_loader import load_active_prompt

router = APIRouter()

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
) -> UploadResponse:
    """Run the T0 pipeline + the Regalica briefing for one validation_run."""
    steps = await _load_t0_steps(pool)
    if not steps:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="workflow_steps T0 catalogue is empty",
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
                    error=f"no python dispatcher registered for agent_type '{step.agent_type}'",
                )
            )
            break
        start = time.monotonic()
        result = await runner(ctx, shared)
        latency = int((time.monotonic() - start) * 1000)
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

    final_status = "t0_complete" if all(r.success for r in reports) else "t0_failed"
    return UploadResponse(
        status=final_status,
        run_id=payload.run_id,
        steps=reports,
        briefing=briefing,
    )
