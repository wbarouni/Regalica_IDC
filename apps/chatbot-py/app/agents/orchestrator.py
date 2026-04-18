"""OrchestratorAgent — Phase 3.

Simple state machine that sequences the evaluation pipeline:
1. Structure validation check (via api service HTTP call).
2. Evaluation run result fetch (via api service HTTP call).
3. InvestigatorAgent per FAIL verdict.
4. ReporterAgent for the full summary.

The orchestrator never calls LLM directly — it delegates to specialist agents.
All HTTP calls to the api service use httpx.AsyncClient.
"""

from __future__ import annotations

import decimal
from typing import Any

import httpx
import structlog
from pydantic import BaseModel, ConfigDict, Field

from app.agents.base import AgentContext, AgentResult, BaseAgent
from app.agents.investigator import InvestigatorAgent, InvestigatorInput
from app.agents.reporter import (
    FailDetail,
    ReporterAgent,
    SkipDetail,
    ValidationRunSummary,
)
from app.llm.base import LLMClient

decimal.getcontext().prec = 38

logger = structlog.get_logger(__name__)


class OrchestratorConfig(BaseModel):
    """Runtime configuration for the OrchestratorAgent."""

    model_config = ConfigDict(frozen=True)

    api_base_url: str = Field(description="Base URL of the api service, e.g. http://api:3000")
    timeout_seconds: float = Field(default=60.0)


class OrchestratorInput(BaseModel):
    """Trigger payload for the orchestration pipeline."""

    model_config = ConfigDict(frozen=True)

    run_id: str
    bank_name: str
    report_date: str
    api_base_url: str = "http://api:3000"
    kb_citations: list[str] = Field(default_factory=list)


class OrchestratorAgent(BaseAgent):
    """Sequences the evaluation pipeline end-to-end.

    Does NOT inherit LLM calls itself; delegates to InvestigatorAgent
    and ReporterAgent which own their own LLM interactions.
    """

    agent_id = "orchestrator"

    def __init__(self, llm: LLMClient) -> None:
        super().__init__(llm)
        self._investigator = InvestigatorAgent(llm)
        self._reporter = ReporterAgent(llm)

    async def execute(
        self,
        input_data: dict[str, Any],
        ctx: AgentContext,
    ) -> AgentResult:
        t0 = self._now_ms()
        log = logger.bind(
            agent=self.agent_id,
            tenant_id=ctx.tenant_id,
            run_id=ctx.run_id,
        )

        orch_input = OrchestratorInput.model_validate(input_data)
        run_id = orch_input.run_id

        log.info("orchestrator.start", run_id=run_id)

        async with httpx.AsyncClient(
            base_url=orch_input.api_base_url,
            timeout=60.0,
        ) as client:
            # Step 1 — fetch run summary from evaluator API
            run_summary_raw = await self._fetch_run_summary(client, run_id, ctx.tenant_id, log)
            if run_summary_raw is None:
                return AgentResult(
                    status="failure",
                    output={"error": f"Run {run_id} not found in api service"},
                    citations=[],
                    confidence=0.0,
                    tokens_used=0,
                    latency_ms=self._now_ms() - t0,
                    error=f"Run {run_id} not found",
                )

        # Step 2 — run InvestigatorAgent on each FAIL
        fail_details_enriched: list[FailDetail] = []
        total_tokens = 0

        for fail_raw in run_summary_raw.get("fails", []):
            inv_input = _build_investigator_input(fail_raw, orch_input.kb_citations)
            inv_result = await self._investigator.execute(inv_input, ctx)
            total_tokens += inv_result.tokens_used

            explanation_fr: str | None = None
            if inv_result.status == "success" and "explanation_fr" in inv_result.output:
                explanation_fr = str(inv_result.output["explanation_fr"])

            fail_details_enriched.append(
                FailDetail(
                    rule_id=fail_raw.get("rule_id", ""),
                    annexe_code=fail_raw.get("annexe_code", ""),
                    gap=str(fail_raw.get("gap", "0")),
                    explanation_fr=explanation_fr,
                    rubriques=list(fail_raw.get("rubrique_codes", [])),
                )
            )

        # Step 3 — build ValidationRunSummary and run ReporterAgent
        validation_summary = ValidationRunSummary(
            run_id=run_id,
            tenant_id=ctx.tenant_id,
            bank_name=orch_input.bank_name,
            report_date=orch_input.report_date,
            annexes_analyzed=list(run_summary_raw.get("annexes_analyzed", [])),
            total_rules=int(run_summary_raw.get("total_rules", 0)),
            pass_count=int(run_summary_raw.get("pass_count", 0)),
            fail_count=int(run_summary_raw.get("fail_count", 0)),
            skip_count=int(run_summary_raw.get("skip_count", 0)),
            global_score=str(run_summary_raw.get("global_score", "0")),
            risk_level=run_summary_raw.get("risk_level", "ELEVE"),
            fail_details=fail_details_enriched,
            skip_details=[
                SkipDetail(
                    rule_id=sk.get("rule_id", ""),
                    annexe_code=sk.get("annexe_code", ""),
                    reason=sk.get("reason", ""),
                )
                for sk in run_summary_raw.get("skips", [])
            ],
            historical_scores=list(run_summary_raw.get("historical_scores", [])),
            kb_citations=orch_input.kb_citations,
        )

        reporter_result = await self._reporter.execute(
            validation_summary.model_dump(), ctx
        )
        total_tokens += reporter_result.tokens_used

        log.info(
            "orchestrator.done",
            run_id=run_id,
            reporter_status=reporter_result.status,
            total_tokens=total_tokens,
        )

        return AgentResult(
            status=reporter_result.status,
            output={
                "report": reporter_result.output,
                "fail_count": len(fail_details_enriched),
                "total_tokens": total_tokens,
            },
            citations=reporter_result.citations,
            confidence=reporter_result.confidence,
            tokens_used=total_tokens,
            latency_ms=self._now_ms() - t0,
        )

    async def _fetch_run_summary(
        self,
        client: httpx.AsyncClient,
        run_id: str,
        tenant_id: str,
        log: Any,
    ) -> dict[str, Any] | None:
        """Fetch validation run summary from the api service."""
        try:
            resp = await client.get(
                f"/api/runs/{run_id}/summary",
                headers={"X-Tenant-ID": tenant_id},
            )
            resp.raise_for_status()
            result: dict[str, Any] = resp.json()
            return result
        except httpx.HTTPStatusError as exc:
            log.error(
                "orchestrator.api_error",
                status_code=exc.response.status_code,
                run_id=run_id,
            )
            return None
        except Exception as exc:
            log.error("orchestrator.fetch_error", error=str(exc), run_id=run_id)
            return None


def _build_investigator_input(
    fail_raw: dict[str, Any],
    kb_citations: list[str],
) -> dict[str, Any]:
    """Map a raw FAIL dict from the API to InvestigatorInput dict."""
    return InvestigatorInput(
        rule_id=str(fail_raw.get("rule_id", "")),
        annexe_code=str(fail_raw.get("annexe_code", "")),
        num_regle=int(fail_raw.get("num_regle", 0)),
        oper_regle=str(fail_raw.get("oper_regle", "=")),
        domaine=str(fail_raw.get("domaine", "")),
        lhs=str(fail_raw.get("lhs", "0")),
        rhs=str(fail_raw.get("rhs", "0")),
        gap=str(fail_raw.get("gap", "0")),
        rubrique_codes=list(fail_raw.get("rubrique_codes", [])),
        rule_text=fail_raw.get("rule_text"),
        context_snippets=kb_citations,
    ).model_dump()
