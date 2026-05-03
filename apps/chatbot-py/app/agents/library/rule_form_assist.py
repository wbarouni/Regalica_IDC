"""RuleFormAssistAgent — draft a structured rule from natural language.

Wires rule_form_assist/draft_rule_from_form (commit 5287920). The
caller supplies a natural-language description of the rule via
fail_context["natural_language_rule"]; the prompt produces the
structured rule envelope for human review.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.agents.base import AgentResult
from app.agents.base_specialist import BaseSpecialistAgent

if TYPE_CHECKING:
    from app.services.orchestrator import _SpecialistContext
    from app.services.prompt_loader import PromptMeta


class RuleFormAssistAgent(BaseSpecialistAgent):
    name: str = "library_rule_form_assist"

    async def execute(
        self,
        context: _SpecialistContext,
        meta: PromptMeta,
    ) -> AgentResult:
        from app.services.orchestrator import _invoke_specialist_json

        fail_ctx = context.fail_context or {}
        payload = {
            "natural_language_rule": fail_ctx.get("natural_language_rule", ""),
            "tenant_id": context.tenant_id,
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
