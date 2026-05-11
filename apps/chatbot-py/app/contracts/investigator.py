"""Strict Pydantic contracts for InvestigatorAgent (T-ZOOM-T2-002).

Aligned on the `investigator/analyze_fail` prompt v2 (planned migration
110). Two enums distinguish row-level FAIL severity from run-level
rule outcome; `RubriqueConfidence` carries the cross-rule signal
injected by the orchestrator from rubrique_confidence_run.

The output schema field names are kept in French to preserve the
contract with the prompt body (no rename, no aggregator break).
"""

from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class TermRole(StrEnum):
    """LHS / RHS role of a term inside one rule's decomposition."""

    LHS = "lhs"
    RHS = "rhs"


class TermStatus(StrEnum):
    """Read-status of a single term value at evaluation time."""

    PRESENT = "present"
    MISSING = "missing"
    NULL = "null"
    GRAYED = "grayed"


class Severity(StrEnum):
    """Row-level FAIL severity persisted in validation_fail_details.severity.

    Aligned 1:1 with the SQL CHECK constraint of migration 026. ONLY
    qualifies a FAIL — there is no SEVERE/ROUNDING for PASS or SKIPPED.
    """

    SEVERE = "severe"
    ROUNDING = "rounding"


class RuleOutcomeInRun(StrEnum):
    """Rule outcome used by the cross-rule confidence calculator.

    Distinct from Severity: PASS and SKIPPED are valid outcomes here
    but are not severities. Used exclusively when consuming the
    rubrique_confidence_run snapshot, not when writing FAIL rows.
    """

    PASS = "pass"
    FAIL_SEVERE = "fail_severe"
    FAIL_ROUNDING = "fail_rounding"
    SKIPPED = "skipped"


class ConfidenceClassification(StrEnum):
    """Cell classification produced by the cross-rule aggregator."""

    INNOCENT = "innocent"
    SUSPECT = "suspect"
    UNDETERMINED = "undetermined"


class Term(BaseModel):
    """One term of a rule's decomposition (used in InvestigatorInput).

    Decimal-bearing fields (expected_value, computed_value) are
    Decimal-serialised strings to preserve banking precision through
    the LLM round trip.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    rang: Annotated[int, Field(ge=1)]
    role: TermRole
    rubrique_code: Annotated[str, Field(min_length=1, max_length=20)]
    colonne_code: Annotated[str, Field(min_length=1, max_length=20)]
    is_sentinel: bool = False
    sentinel_code: Annotated[str | None, Field(max_length=5)] = None
    expected_value: str | None = None
    computed_value: str | None = None
    status: TermStatus = TermStatus.PRESENT


class RubriqueConfidence(BaseModel):
    """Snapshot per (annexe, rubrique, colonne) for one run.

    NO `rang` field — confidence aggregates across rules where rang is
    a per-rule property of a term (CTO blocker 2 of T-ZOOM-T2-002).

    `score` is Decimal-serialised; consumers parse via decimal at the
    call site to preserve precision.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    annexe_code: Annotated[str, Field(min_length=1, max_length=20)]
    rubrique_code: Annotated[str, Field(min_length=1, max_length=20)]
    colonne_code: Annotated[str, Field(min_length=1, max_length=20)]
    score: str
    contributing_rules_count: Annotated[int, Field(ge=0)]
    classification: ConfidenceClassification
    contributing_rule_ids: list[str] = Field(default_factory=list)


class Citation(BaseModel):
    """Regulatory citation surfaced by the InvestigatorAgent."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    source_type: Annotated[str, Field(min_length=1)]
    source_ref: Annotated[str, Field(min_length=1)]
    excerpt_fr: Annotated[str, Field(min_length=1, max_length=500)]


class SuspectRanking(BaseModel):
    """Per-rubrique suspect rank, computed post-LLM by the orchestrator.

    Derived deterministically from `RubriqueConfidence` rows attached
    to InvestigatorInput; not produced by the LLM itself. Surfaced in
    InvestigatorOutput as a side-channel for the aggregator's prose.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    rubrique_code: str
    colonne_code: str
    rank_position: Annotated[int, Field(ge=1)]
    confidence_classification: ConfidenceClassification


class InvestigatorInput(BaseModel):
    """Strict input contract for InvestigatorAgent.analyze.

    Aligned on the prompt body of `investigator/analyze_fail` v2 once
    migration 110 lands. Three blocks: verdict, rule, rubrique_confidence.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    # Verdict block — what the engine emitted for the FAIL being
    # analysed.
    verdict_ax_term: Annotated[str, Field(min_length=1, max_length=10)]
    verdict_num_regle: Annotated[int, Field(ge=1)]
    verdict_lhs: str | None
    verdict_rhs: str | None
    verdict_gap: str | None
    verdict_gap_relative: str | None
    verdict_severity: Severity
    verdict_terms: list[Term]

    # Rule block — the rule definition for context.
    rule_id: str
    rule_ax_term: str
    rule_num_regle: int
    rule_expression: str
    rule_zone_texte: str | None
    rule_natural_language: str

    # T-ZOOM-T2-002 — cross-rule confidence rows for the cells this
    # rule references. Injected by the orchestrator from
    # rubrique_confidence_run.
    rubrique_confidence: list[RubriqueConfidence] = Field(default_factory=list)

    # Tenant scope.
    tenant_id: str
    session_id: str | None = None


class InvestigatorOutput(BaseModel):
    """Strict output contract for InvestigatorAgent.analyze.

    Field names are in French to mirror the prompt's contractual
    `FORMAT DE SORTIE`. DO NOT rename — the aggregator
    `regalica/aggregate_zoom_fail` consumes these names.

    `suspect_ranking` is the only non-LLM-produced field; the
    orchestrator computes it post-validation from the input
    `rubrique_confidence` payload.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    # The min_length / max_length bounds below mirror the
    # `output_schema` JSON of `investigator/analyze_fail` and
    # `investigator/correct_output` (migrations 109, 111). They are
    # NOT operator-tunable knobs — they are the Pydantic-side
    # reflection of the prompt_bank contract. Moving them to
    # platform_config would split the source of truth across two
    # tables and require synchronised updates on every prompt rev.
    cause_racine: Annotated[
        str,
        Field(min_length=10, max_length=2000),  # nosemgrep: D-006-magic-number-assignment
    ]
    rubrique_incriminee: Annotated[str, Field(min_length=1, max_length=20)]
    colonne_incriminee: Annotated[str | None, Field(max_length=20)] = None
    suggestion_correction: Annotated[
        str,
        Field(min_length=10, max_length=1000),  # nosemgrep: D-006-magic-number-assignment
    ]
    circulaire_reference: str | None = None
    niveau_confiance: Annotated[str, Field(pattern="^(high|medium|low)$")]
    regles_liees: list[str] = Field(default_factory=list)
    explication_ecart: Annotated[
        str,
        Field(min_length=10, max_length=2000),  # nosemgrep: D-006-magic-number-assignment
    ]

    # Computed post-LLM by the orchestrator. Defaults to empty when
    # no rubrique_confidence was injected.
    suspect_ranking: list[SuspectRanking] = Field(default_factory=list)
