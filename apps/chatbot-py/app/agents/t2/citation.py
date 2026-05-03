"""CitationAgent — regulatory-source lookup for a BCT rule.

Calls the LLM with the prompt template loaded from `prompt_bank`,
passing the rule (axTerm, numRegle, naturalLanguage) as the user
message. Phase 3-bis will plug pgvector RAG retrieval into the
context so the LLM grounds its citation against actual circular
text; for Phase 3 minimal, the agent simply surfaces what the LLM
returns.

Output JSON contract (informational — the agent does not enforce
the shape, the prompt template controls what the LLM emits):
  {
    "circulaire": "...",
    "article": "...",
    "paragraphe": "...",
    "texte_pertinent": "...",
    "confidence": "high|medium|low"
  }
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


class CitationAgent(BaseSpecialistAgent):
    """Resolve the regulatory source for a single rule."""

    name: str = "t2_citation"

    async def execute(
        self,
        context: _SpecialistContext,
        meta: PromptMeta,
    ) -> AgentResult:
        """Delegate to find_source — see BaseSpecialistAgent docstring."""
        return await self.find_source(
            rule=context.rule_context or {},
            llm_client=context.llm_client,
            prompt_template=meta["template"],
            temperature=meta["temperature"],
            max_tokens=meta["max_tokens"],
            thinking_enabled=meta["thinking_enabled"],
        )

    async def find_source(
        self,
        rule: dict[str, Any],
        llm_client: LLMClient,
        prompt_template: str,
        temperature: float,
        max_tokens: int,
        thinking_enabled: bool,
    ) -> AgentResult:
        """Return the LLM-parsed citation as `AgentResult.output`."""
        start = time.monotonic()
        user_message = json.dumps({"rule": rule}, ensure_ascii=False)
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
