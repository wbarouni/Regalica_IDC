"""Common interface for every REGFlow specialist agent.

Per docs/09 §1, REGFlow ships 14 agents:
  Orchestratrice : Regalica.
  T0 deterministic : IngestorXML, Dependency, Temporal.
  T2 LLM : Citation, Investigator, Historical (existing).
  Library  : ReporterDocx, ReporterPdf, VisualizerChart,
             DiffNarrate, ReferentialIngestorPdf, RuleFormAssist.

Every specialist that runs through `_invoke_specialist` (orchestrator
table dispatch) implements this ABC. The orchestrator only sees the
`execute(context, meta) -> AgentResult` contract; agent-specific
construction details live in the subclass.

Existing T2 specialists keep their original surface (`find_source`,
`analyze`, `compare`); their `execute()` simply delegates to the
existing method so legacy callers and tests stay untouched.

The new C17 library specialists implement `execute()` directly via the
JSON-contract pipeline (`_invoke_specialist_json` from C13) without
the per-method legacy surface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

from app.agents.base import AgentResult

if TYPE_CHECKING:
    from app.services.orchestrator import _SpecialistContext
    from app.services.prompt_loader import PromptMeta


class BaseSpecialistAgent(ABC):
    """Uniform interface implemented by every specialist agent."""

    @abstractmethod
    async def execute(
        self,
        context: _SpecialistContext,
        meta: PromptMeta,
    ) -> AgentResult:
        """Run the specialist and return the canonical AgentResult.

        Args:
            context: shared `_SpecialistContext` carrying pool, llm_client,
                tenant_id, current_run_id and the optional fail/rule context
                dicts. C17a adds `api_client` to support specialists that
                need to call back into the engine route (T1 runner).
            meta: active PromptMeta loaded from `prompt_bank` for this
                specialist's `(agent_type, function_name)` pair.

        Returns:
            AgentResult — `output` dict shape is per-specialist; the
            orchestrator only inspects `success`, `error` and `output`
            keys generically.
        """
        ...
