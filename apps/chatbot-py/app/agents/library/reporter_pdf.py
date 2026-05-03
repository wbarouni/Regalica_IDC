"""ReporterPdfAgent — produce the typed envelope for WeasyPrint rendering.

Wires the regalica/reporter `generate_pdf` prompt (commit ccd371b). Same
payload shape as the DOCX variant; the prompt's 9-style enum
(page_break/header/footer extension) makes it the PDF-aware counterpart.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.agents.base import AgentResult
from app.agents.base_specialist import BaseSpecialistAgent

if TYPE_CHECKING:
    from app.services.orchestrator import _SpecialistContext
    from app.services.prompt_loader import PromptMeta


class ReporterPdfAgent(BaseSpecialistAgent):
    name: str = "library_reporter_pdf"

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
