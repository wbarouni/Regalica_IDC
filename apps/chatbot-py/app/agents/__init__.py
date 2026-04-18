"""5 probabilistic LLM agents — Phase 3/4/5.

Re-exports all agent classes and shared types for convenient imports.
"""

from app.agents.base import AgentContext, AgentResult, BaseAgent
from app.agents.investigator import (
    InvestigatorAgent,
    InvestigatorInput,
    InvestigatorOutput,
)
from app.agents.orchestrator import OrchestratorAgent, OrchestratorInput
from app.agents.reporter import (
    ReporterAgent,
    ValidationRunSummary,
)
from app.agents.rule_learner import RuleLearnerAgent, RuleLearnerInput
from app.agents.schema_inferencer import SchemaInferencerAgent, SchemaInferencerInput

__all__ = [
    # Base
    "AgentContext",
    "AgentResult",
    "BaseAgent",
    # Agent 1 — Orchestrator
    "OrchestratorAgent",
    "OrchestratorInput",
    # Agent 2 — SchemaInferencer
    "SchemaInferencerAgent",
    "SchemaInferencerInput",
    # Agent 3 — RuleLearner
    "RuleLearnerAgent",
    "RuleLearnerInput",
    # Agent 4 — Investigator (PRIORITY)
    "InvestigatorAgent",
    "InvestigatorInput",
    "InvestigatorOutput",
    # Agent 5 — Reporter
    "ReporterAgent",
    "ValidationRunSummary",
]
