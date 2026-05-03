"""ReferentialIngestorPdfAgent — extract structured referentials from PDF.

Wires referential_ingestor/extract_referential_from_pdf (commit d8b2042).
The prompt's input_schema deliberately excludes file_base64 from the LLM
contract (it is consumed by Gemini's multimodal channel upstream); the
HTTP caller still ships file_base64, but the LLM payload only carries
the metadata fields source_type / target_referential / tenant_id /
requested_by_user_id.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.agents.base import AgentResult
from app.agents.base_specialist import BaseSpecialistAgent

if TYPE_CHECKING:
    from app.services.orchestrator import _SpecialistContext
    from app.services.prompt_loader import PromptMeta


class ReferentialIngestorPdfAgent(BaseSpecialistAgent):
    name: str = "library_referential_ingestor_pdf"

    async def execute(
        self,
        context: _SpecialistContext,
        meta: PromptMeta,
    ) -> AgentResult:
        from app.services.orchestrator import _invoke_specialist_json

        fail_ctx = context.fail_context or {}
        payload = {
            "source_type": "pdf",
            "target_referential": fail_ctx.get("target_referential", "annexes"),
            "tenant_id": context.tenant_id,
            "requested_by_user_id": fail_ctx.get("requested_by_user_id", ""),
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
