"""InvestigatorAgent — root-cause analysis of a FAIL severe verdict.

Calls the LLM with the prompt template loaded from `prompt_bank`
(no template baked into source), passing the failing rule
context and the verdict numbers as the user message. The LLM is
expected to return JSON; the agent parses it and surfaces the
result as `AgentResult.output`. JSON decode errors and LLM-side
exceptions are caught and converted to `success=False, error=...`
so the orchestrator never sees a raw provider exception.

Phase 3 minimal: the prompt template arrives as a placeholder
(`[INVESTIGATOR_ANALYZE_FAIL_V1]`) until Phase 3-bis fills it
with the real instruction text. Whatever the template, the agent
treats it as the LLM `system_prompt` and serialises the input
context as JSON in the user `prompt`.
"""

from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING, Any

from app.agents.base import AgentResult
from app.agents.base_specialist import BaseSpecialistAgent
from app.llm.base import LLMClient, LLMRequest

if TYPE_CHECKING:
    from app.services.orchestrator import _SpecialistContext
    from app.services.prompt_loader import PromptMeta


class InvestigatorAgent(BaseSpecialistAgent):
    """Generate a French causal explanation for a FAIL severe verdict."""

    name: str = "t2_investigator"

    async def execute(
        self,
        context: _SpecialistContext,
        meta: PromptMeta,
    ) -> AgentResult:
        """Delegate to analyze — see BaseSpecialistAgent docstring."""
        return await self.analyze(
            fail=context.fail_context or {},
            rule=context.rule_context or {},
            llm_client=context.llm_client,
            prompt_template=meta["template"],
            temperature=meta["temperature"],
            max_tokens=meta["max_tokens"],
            thinking_enabled=meta["thinking_enabled"],
        )

    async def analyze(
        self,
        fail: dict[str, Any],
        rule: dict[str, Any],
        llm_client: LLMClient,
        prompt_template: str,
        temperature: float,
        max_tokens: int,
        thinking_enabled: bool,
    ) -> AgentResult:
        """Return an AgentResult parsed from the LLM JSON response."""
        start = time.monotonic()
        user_message = json.dumps({"fail": fail, "rule": rule}, ensure_ascii=False)
        request = LLMRequest(
            prompt=user_message,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking_enabled=thinking_enabled,
            system_prompt=prompt_template,
        )

        try:
            response = await llm_client.complete(request)
        except Exception as exc:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"LLM call failed: {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        try:
            parsed: dict[str, Any] = json.loads(response.content)
        except json.JSONDecodeError as exc:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"LLM returned invalid JSON: {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        return AgentResult(
            agent_name=self.name,
            success=True,
            output=parsed,
            latency_ms=int((time.monotonic() - start) * 1000),
        )
