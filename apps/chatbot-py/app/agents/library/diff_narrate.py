"""DiffNarrateAgent — narrate the diff between two validation runs.

Wires the diff/narrate_diff prompt (commit 6087db9 — final 22/22 of
C10). Diff arithmetic is precomputed by the Python caller; the prompt
only narrates and emits a 3-enum verdict (amelioration/regression/stable).
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.agents.base import AgentResult
from app.agents.base_specialist import BaseSpecialistAgent

if TYPE_CHECKING:
    from app.services.orchestrator import _SpecialistContext
    from app.services.prompt_loader import PromptMeta


class DiffNarrateAgent(BaseSpecialistAgent):
    name: str = "library_diff_narrate"

    async def execute(
        self,
        context: _SpecialistContext,
        meta: PromptMeta,
    ) -> AgentResult:
        from app.services.orchestrator import _invoke_specialist_json

        fail_ctx = context.fail_context or {}
        payload = {
            "run_id_b": context.current_run_id or "",
            "run_id_a": fail_ctx.get("run_id_a", ""),
            "tenant_id": context.tenant_id,
            "diff_data": fail_ctx,
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
