"""T2 agents (LLM-backed).

Three post-validation agents that enrich a verdict run:
- InvestigatorAgent — root-cause narrative for a FAIL severe.
- CitationAgent     — finds the regulatory source for a rule.
- HistoricalAgent   — compares the current run with the last 5
                      runs of the same tenant.

Each takes a `prompt_template` (loaded from `prompt_bank` via
`app.services.prompt_loader.load_active_prompt`) and the runtime
LLM parameters (`temperature`, `max_tokens`, `thinking_enabled`)
so no template is baked into source.

Reporter / Visualizer / Diff are deferred to Phase 3-bis.
"""

from app.agents.t2.citation import CitationAgent
from app.agents.t2.historical import HistoricalAgent
from app.agents.t2.investigator import InvestigatorAgent

# `__all__` re-exports the three concrete agent classes. The
# entries are Python symbol names introduced just above, not magic
# dispatch strings, so D-002 is silenced explicitly per line.
__all__ = [
    "CitationAgent",  # nosemgrep: D-002-agent-class-literal
    "HistoricalAgent",  # nosemgrep: D-002-agent-class-literal
    "InvestigatorAgent",  # nosemgrep: D-002-agent-class-literal
]
