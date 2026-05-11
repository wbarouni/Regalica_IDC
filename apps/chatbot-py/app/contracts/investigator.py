"""Strict Pydantic contracts for InvestigatorAgent (T-ZOOM-T2-002).

Aligned on the `investigator/analyze_fail` prompt v2 (planned migration
110). Two enums distinguish row-level FAIL severity from run-level
rule outcome; `RubriqueConfidence` carries the cross-rule signal
injected by the orchestrator from rubrique_confidence_run.

The output schema field names are kept in French to preserve the
contract with the prompt body (no rename, no aggregator break).
"""

from enum import StrEnum
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class CellRef(BaseModel):
    """Identifier for one cell of a regulatory annex (rubrique + colonne).

    Lot A (anti-hallucination guard, audit 2026-05-12) — InvestigatorOutput
    now carries explicit lists of cells classified as incriminée /
    innocentée / indéterminée. Each CellRef is a structured pair that
    `llm_output_guard.verify_investigator_against_db` cross-checks
    against `rubrique_confidence_run`. The pair is intentionally tiny —
    no value, no score, no rule reference — because the guard only
    validates the LLM's class assignment, not its underlying reasoning.

    `rubrique` / `colonne` field names mirror the prompt's
    `FORMAT DE SORTIE` block; do not rename without a coordinated
    prompt_bank update.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    rubrique: Annotated[str, Field(min_length=1, max_length=20)]
    colonne: Annotated[str, Field(min_length=1, max_length=20)]


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

    # Lot A (anti-hallucination guard, audit 2026-05-12) — three
    # explicit lists of cells the LLM claims to have classified.
    # Default empty so existing prompt outputs (which do not yet
    # produce these fields) continue to validate. A future
    # `investigator/analyze_fail` prompt revision will require non-
    # empty rubrique_incriminee_cells when at least one cell is
    # suspect; until then the guard is dormant but the contract is
    # in place.
    #
    # `rubrique_incriminee_cells` — cells the LLM asserts are
    # `classification = 'suspect'` in rubrique_confidence_run. The
    # guard rejects any cell not actually suspect in DB.
    rubrique_incriminee_cells: list[CellRef] = Field(default_factory=list)

    # `rubriques_innocentees_cells` — cells the LLM asserts are
    # `classification = 'innocent'`. Same guard semantics, symmetric.
    rubriques_innocentees_cells: list[CellRef] = Field(default_factory=list)

    # `rubriques_indeterminees_cells` — cells the LLM asserts are
    # `classification = 'undetermined'`. Same guard semantics, symmetric.
    rubriques_indeterminees_cells: list[CellRef] = Field(default_factory=list)

    # `guard_notice` — populated by `llm_output_guard` when one or
    # more CellRef entries were filtered out for failing the DB
    # cross-check. Text is loaded from prompt_bank
    # `regalica/guard_notice_correction` (migration 118); never
    # hardcoded in source. None when the guard found no violations.
    guard_notice: str | None = None

    @field_validator(
        "rubrique_incriminee_cells",
        "rubriques_innocentees_cells",
        "rubriques_indeterminees_cells",
    )
    @classmethod
    def _no_duplicate_cells(cls, cells: list[CellRef]) -> list[CellRef]:
        """Reject duplicate (rubrique, colonne) pairs inside a list.

        Structure-only check: the DB cross-check lives in
        `app.services.llm_output_guard`. Pure Pydantic validators
        cannot reach a DB pool, by design.
        """
        seen: set[tuple[str, str]] = set()
        for cell in cells:
            key = (cell.rubrique, cell.colonne)
            if key in seen:
                raise ValueError(
                    f"duplicate cell ({cell.rubrique}, {cell.colonne}) in classification list"
                )
            seen.add(key)
        return cells

    @model_validator(mode="before")
    @classmethod
    def _derive_scalar_incriminee_from_cells(cls, data: Any) -> Any:
        """Fill the scalar `rubrique_incriminee` / `colonne_incriminee`
        fields from `rubrique_incriminee_cells[0]` when the scalars
        are absent and the list is populated.

        Backward compatibility shim: older `investigator/analyze_fail`
        prompts emit the scalars directly; newer prompts will emit
        the structured list. This validator bridges both shapes
        without forcing the aggregator to know which one fired.
        """
        if not isinstance(data, dict):
            return data
        cells = data.get("rubrique_incriminee_cells")
        if not isinstance(cells, list) or not cells:
            return data
        first = cells[0]
        # Accept either dict (from JSON) or CellRef-shaped object.
        if isinstance(first, dict):
            first_rubrique = first.get("rubrique")
            first_colonne = first.get("colonne")
        else:
            first_rubrique = getattr(first, "rubrique", None)
            first_colonne = getattr(first, "colonne", None)
        scalar_missing = data.get("rubrique_incriminee") in (None, "")
        if scalar_missing and isinstance(first_rubrique, str) and first_rubrique:
            data["rubrique_incriminee"] = first_rubrique
        colonne_missing = data.get("colonne_incriminee") in (None, "")
        if colonne_missing and isinstance(first_colonne, str) and first_colonne:
            data["colonne_incriminee"] = first_colonne
        return data
