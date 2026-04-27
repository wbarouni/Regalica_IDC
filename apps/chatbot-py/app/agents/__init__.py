"""T0 agents (deterministic).

Three pre-validation agents that run BEFORE the engine kicks off:
- IngestorXMLAgent — parses the XML header (no LLM).
- DependencyAgent  — checks companion annexes are present (DB-only).
- TemporalAgent    — validates arrete_date coherence + computes T-1.

All three return a uniform `AgentResult` so the orchestrator
(commit 28+) can chain them without provider-specific glue.
"""

from app.agents.base import AgentResult
from app.agents.t0_dependency import DependencyAgent
from app.agents.t0_ingestor import IngestorXMLAgent
from app.agents.t0_temporal import TemporalAgent

# `__all__` declares the package's public re-exports. The entries
# are Python symbol names (the same identifiers introduced by the
# `from ... import` lines just above), not magic dispatch strings,
# so the D-002 guard is silenced explicitly per line.
__all__ = [
    "AgentResult",
    "DependencyAgent",  # nosemgrep: D-002-agent-class-literal
    "IngestorXMLAgent",  # nosemgrep: D-002-agent-class-literal
    "TemporalAgent",  # nosemgrep: D-002-agent-class-literal
]
