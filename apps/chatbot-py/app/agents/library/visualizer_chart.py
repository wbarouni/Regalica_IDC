"""VisualizerChartAgent — produce the SVG chart envelope.

Wires the visualizer/produce_chart prompt (commit cb3d42f). chart_type
defaults to bar_chart (the most common dashboard visualisation) when
the caller does not specify one.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.agents.base import AgentResult
from app.agents.base_specialist import BaseSpecialistAgent

if TYPE_CHECKING:
    from app.services.orchestrator import _SpecialistContext
    from app.services.prompt_loader import PromptMeta


class VisualizerChartAgent(BaseSpecialistAgent):
    name: str = "library_visualizer_chart"

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
            "chart_type": fail_ctx.get("chart_type", "bar_chart"),
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
