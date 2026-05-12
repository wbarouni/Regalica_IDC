"""Strict Pydantic v2 contracts for chatbot-py specialist agents.

T-ZOOM-T2-002 introduces InvestigatorInput/Output aligned on the
`investigator/analyze_fail` prompt v2 (migration 110, scheduled).
Re-exported here so callers can import from a single namespace.
"""

from app.contracts.investigator import (
    CausalAttribution,
    CellRef,
    Citation,
    ConfidenceClassification,
    InvestigatorInput,
    InvestigatorOutput,
    RubriqueConfidence,
    RuleOutcomeInRun,
    Severity,
    SuspectRanking,
    Term,
    TermRole,
    TermStatus,
)

__all__ = [
    "CausalAttribution",
    "CellRef",
    "Citation",
    "ConfidenceClassification",
    "InvestigatorInput",
    "InvestigatorOutput",
    "RubriqueConfidence",
    "RuleOutcomeInRun",
    "Severity",
    "SuspectRanking",
    "Term",
    "TermRole",
    "TermStatus",
]
