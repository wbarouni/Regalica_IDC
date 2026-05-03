"""ReporterDocxAgent — produce the typed envelope for python-docx rendering.

Wires the regalica/reporter `generate_docx` prompt (commit f49d027) to
the orchestrator's JSON-contract runner. Payload mirrors the C10 input
schema: run_id, tenant_id, report_type, validation_run.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.agents.base import AgentResult
from app.agents.base_specialist import BaseSpecialistAgent

if TYPE_CHECKING:
    from app.services.orchestrator import _SpecialistContext
    from app.services.prompt_loader import PromptMeta


class ReporterDocxAgent(BaseSpecialistAgent):
    name: str = "library_reporter_docx"

    async def execute(
        self,
        context: _SpecialistContext,
        meta: PromptMeta,
    ) -> AgentResult:
        from app.services.orchestrator import _invoke_specialist_json

        fail_ctx = context.fail_context or {}
        payload = {
            "run_id": context.current_run_id or "",
            "tenant_id": context.tenant_id,
            "report_type": fail_ctx.get("report_type", "livrable_a"),
            "validation_run": fail_ctx,
        }
        result = await _invoke_specialist_json(
            meta=meta,
            llm_client=context.llm_client,
            payload=payload,
        )
        return AgentResult(
            agent_name=self.name,
            success=True,
            output=result,
            error=None,
        )
