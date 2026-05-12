"""Unit tests for app.contracts.investigator (T-ZOOM-T2-002 Phase 5).

Pure Pydantic v2 validation tests — no DB, no LLM, no orchestrator.
Verify:
  - acceptance of canonical payloads
  - rejection of `extra` fields (extra='forbid')
  - rejection of out-of-range / wrong-type values
  - distinction between Severity and RuleOutcomeInRun (no enum overlap)
  - RubriqueConfidence has NO `rang` field (cross-rule key without rang)
  - Decimal-bearing fields stay as strings through serialisation
"""

from __future__ import annotations

import pytest
from app.contracts.investigator import (
    CausalAttribution,
    CellRef,
    ConfidenceClassification,
    InvestigatorInput,
    InvestigatorOutput,
    RubriqueConfidence,
    RuleOutcomeInRun,
    Severity,
    Term,
    TermRole,
    TermStatus,
)
from pydantic import ValidationError


def _canonical_term() -> dict:
    return {
        "rang": 1,
        "role": "rhs",
        "rubrique_code": "PA01",
        "colonne_code": "C1",
        "is_sentinel": False,
        "sentinel_code": None,
        "expected_value": "100.00",
        "computed_value": None,
        "status": "present",
    }


def _canonical_input() -> dict:
    return {
        "verdict_ax_term": "RSM630",
        "verdict_num_regle": 266,
        "verdict_lhs": "21457.97",
        "verdict_rhs": "0.00",
        "verdict_gap": "21457.97",
        "verdict_gap_relative": "1.0",
        "verdict_severity": "severe",
        "verdict_terms": [_canonical_term()],
        "rule_id": "11111111-0000-0000-0000-000000000266",
        "rule_ax_term": "RSM630",
        "rule_num_regle": 266,
        "rule_expression": "PA01 = PA02 + PA03",
        "rule_zone_texte": None,
        "rule_natural_language": "PA01 colonne C1 = somme",
        "rubrique_confidence": [],
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "session_id": None,
    }


def _canonical_output() -> dict:
    return {
        "cause_racine": "Erreur de mapping sur PA03 colonne C1.",
        "rubrique_incriminee": "PA03",
        "colonne_incriminee": "C1",
        "suggestion_correction": "Vérifier l'alimentation de la rubrique PA03.",
        "circulaire_reference": None,
        "niveau_confiance": "medium",
        "regles_liees": [],
        "explication_ecart": "L'écart de 21457.97 KTND provient d'une absorption manquante.",
    }


class TestInvestigatorInput:
    def test_accepts_canonical_payload(self) -> None:
        model = InvestigatorInput.model_validate(_canonical_input())
        assert model.verdict_severity is Severity.SEVERE
        assert len(model.verdict_terms) == 1
        assert model.verdict_terms[0].role is TermRole.RHS

    def test_rejects_extra_field(self) -> None:
        payload = _canonical_input()
        payload["extra_field"] = "boom"
        with pytest.raises(ValidationError):
            InvestigatorInput.model_validate(payload)

    def test_rejects_invalid_severity(self) -> None:
        payload = _canonical_input()
        payload["verdict_severity"] = "extreme"
        with pytest.raises(ValidationError):
            InvestigatorInput.model_validate(payload)

    def test_rejects_term_with_invalid_role(self) -> None:
        payload = _canonical_input()
        payload["verdict_terms"][0]["role"] = "neither"
        with pytest.raises(ValidationError):
            InvestigatorInput.model_validate(payload)

    def test_rejects_term_with_rang_zero(self) -> None:
        payload = _canonical_input()
        payload["verdict_terms"][0]["rang"] = 0
        with pytest.raises(ValidationError):
            InvestigatorInput.model_validate(payload)

    def test_accepts_rubrique_confidence_payload(self) -> None:
        payload = _canonical_input()
        payload["rubrique_confidence"] = [
            {
                "annexe_code": "RSM630",
                "rubrique_code": "PA01",
                "colonne_code": "C1",
                "score": "1.0",
                "contributing_rules_count": 2,
                "classification": "innocent",
                "contributing_rule_ids": ["r-1", "r-2"],
            }
        ]
        model = InvestigatorInput.model_validate(payload)
        assert len(model.rubrique_confidence) == 1
        assert model.rubrique_confidence[0].classification is ConfidenceClassification.INNOCENT


class TestInvestigatorOutput:
    def test_accepts_canonical_payload(self) -> None:
        model = InvestigatorOutput.model_validate(_canonical_output())
        assert model.niveau_confiance == "medium"
        assert model.suspect_ranking == []

    def test_rejects_niveau_confiance_outside_canonical_set(self) -> None:
        payload = _canonical_output()
        payload["niveau_confiance"] = "extreme"
        with pytest.raises(ValidationError):
            InvestigatorOutput.model_validate(payload)

    def test_rejects_cause_racine_too_short(self) -> None:
        payload = _canonical_output()
        payload["cause_racine"] = "court"
        with pytest.raises(ValidationError):
            InvestigatorOutput.model_validate(payload)

    def test_rejects_cause_racine_too_long(self) -> None:
        payload = _canonical_output()
        payload["cause_racine"] = "x" * 2001
        with pytest.raises(ValidationError):
            InvestigatorOutput.model_validate(payload)

    def test_rejects_extra_field(self) -> None:
        payload = _canonical_output()
        payload["extra_payload"] = "boom"
        with pytest.raises(ValidationError):
            InvestigatorOutput.model_validate(payload)


class TestInvestigatorOutputCellRefFields:
    """Lot A — anti-hallucination guard contract surface (commit 1).

    Structure-only validation: duplicates rejected, scalar fields
    auto-derived from cells[0] when omitted, lists default empty.
    The DB cross-check is covered by `test_llm_output_guard.py`.
    """

    def test_cell_lists_default_to_empty(self) -> None:
        model = InvestigatorOutput.model_validate(_canonical_output())
        assert model.rubrique_incriminee_cells == []
        assert model.rubriques_innocentees_cells == []
        assert model.rubriques_indeterminees_cells == []
        assert model.guard_notice is None

    def test_accepts_populated_cell_lists(self) -> None:
        payload = _canonical_output()
        payload["rubrique_incriminee_cells"] = [{"rubrique": "PA03", "colonne": "C1"}]
        payload["rubriques_innocentees_cells"] = [
            {"rubrique": "PA01", "colonne": "C2"},
            {"rubrique": "PA02", "colonne": "C3"},
        ]
        model = InvestigatorOutput.model_validate(payload)
        assert len(model.rubrique_incriminee_cells) == 1
        assert model.rubrique_incriminee_cells[0].rubrique == "PA03"
        assert len(model.rubriques_innocentees_cells) == 2

    def test_rejects_duplicate_cell_in_same_list(self) -> None:
        payload = _canonical_output()
        payload["rubriques_innocentees_cells"] = [
            {"rubrique": "PA01", "colonne": "C1"},
            {"rubrique": "PA01", "colonne": "C1"},  # duplicate
        ]
        with pytest.raises(ValidationError):
            InvestigatorOutput.model_validate(payload)

    def test_derives_scalar_from_first_incriminee_cell(self) -> None:
        """When scalar incriminee fields are absent and the list has
        entries, the scalars are filled from cells[0] — backward-
        compat shim for the aggregator prompt which still reads the
        scalars by name.
        """
        payload = _canonical_output()
        del payload["rubrique_incriminee"]
        del payload["colonne_incriminee"]
        payload["rubrique_incriminee_cells"] = [{"rubrique": "63099000000000", "colonne": "10"}]
        model = InvestigatorOutput.model_validate(payload)
        assert model.rubrique_incriminee == "63099000000000"
        assert model.colonne_incriminee == "10"

    def test_keeps_explicit_scalar_over_derived_one(self) -> None:
        """Explicit scalar wins. If both the list and the scalar are
        provided, the scalar is NOT overwritten by the derivation."""
        payload = _canonical_output()
        payload["rubrique_incriminee"] = "EXPLICIT"
        payload["colonne_incriminee"] = "EX"
        payload["rubrique_incriminee_cells"] = [{"rubrique": "PA03", "colonne": "C9"}]
        model = InvestigatorOutput.model_validate(payload)
        assert model.rubrique_incriminee == "EXPLICIT"
        assert model.colonne_incriminee == "EX"


class TestCellRef:
    def test_accepts_canonical_pair(self) -> None:
        cell = CellRef.model_validate({"rubrique": "PA030302000001", "colonne": "10"})
        assert cell.rubrique == "PA030302000001"
        assert cell.colonne == "10"

    def test_rejects_empty_rubrique(self) -> None:
        with pytest.raises(ValidationError):
            CellRef.model_validate({"rubrique": "", "colonne": "10"})

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            CellRef.model_validate({"rubrique": "PA01", "colonne": "C1", "extra": "boom"})

    def test_is_frozen(self) -> None:
        cell = CellRef.model_validate({"rubrique": "PA01", "colonne": "C1"})
        with pytest.raises(ValidationError):
            cell.rubrique = "MUTATED"  # type: ignore[misc]


class TestCausalAttribution:
    """Lot A.2.1 — structure-only validation of CausalAttribution.

    The DB cross-check (rule_id ∈ contributing_rule_ids) lives in
    `app.services.llm_output_guard.verify_causal_attributions_against_db`
    and is covered by `test_llm_output_guard.py`.
    """

    def test_accepts_canonical_payload(self) -> None:
        attr = CausalAttribution.model_validate(
            {
                "cell": {"rubrique": "63099000000000", "colonne": "10"},
                "attributed_rule_ax_term": "630",
                "attributed_rule_num_regle": 330,
            }
        )
        assert attr.cell == CellRef(rubrique="63099000000000", colonne="10")
        assert attr.attributed_rule_ax_term == "630"
        assert attr.attributed_rule_num_regle == 330

    def test_rejects_empty_ax_term(self) -> None:
        with pytest.raises(ValidationError):
            CausalAttribution.model_validate(
                {
                    "cell": {"rubrique": "PA01", "colonne": "C1"},
                    "attributed_rule_ax_term": "",
                    "attributed_rule_num_regle": 1,
                }
            )

    def test_rejects_num_regle_below_one(self) -> None:
        with pytest.raises(ValidationError):
            CausalAttribution.model_validate(
                {
                    "cell": {"rubrique": "PA01", "colonne": "C1"},
                    "attributed_rule_ax_term": "630",
                    "attributed_rule_num_regle": 0,
                }
            )

    def test_rejects_ax_term_too_long(self) -> None:
        # DB column is varchar(10) — anything longer is contract drift.
        with pytest.raises(ValidationError):
            CausalAttribution.model_validate(
                {
                    "cell": {"rubrique": "PA01", "colonne": "C1"},
                    "attributed_rule_ax_term": "X" * 11,
                    "attributed_rule_num_regle": 330,
                }
            )

    def test_rejects_extra_field(self) -> None:
        with pytest.raises(ValidationError):
            CausalAttribution.model_validate(
                {
                    "cell": {"rubrique": "PA01", "colonne": "C1"},
                    "attributed_rule_ax_term": "630",
                    "attributed_rule_num_regle": 330,
                    "extra": "boom",
                }
            )

    def test_is_frozen(self) -> None:
        attr = CausalAttribution.model_validate(
            {
                "cell": {"rubrique": "PA01", "colonne": "C1"},
                "attributed_rule_ax_term": "630",
                "attributed_rule_num_regle": 330,
            }
        )
        with pytest.raises(ValidationError):
            attr.attributed_rule_num_regle = 999  # type: ignore[misc]


class TestInvestigatorOutputCausalAttributions:
    """Lot A.2.1 — InvestigatorOutput surface for causal attributions.

    Three semantic states tested: None (legacy), [] (no claims),
    [...] (claims to be DB-validated downstream by the guard).
    """

    def test_causal_attributions_defaults_to_none(self) -> None:
        """None ≠ [] — None means the LLM did not emit the field
        (legacy prompt v1/v2); [] means it emitted but with zero
        attributions. The guard distinguishes these states."""
        model = InvestigatorOutput.model_validate(_canonical_output())
        assert model.causal_attributions is None

    def test_accepts_empty_causal_attributions_list(self) -> None:
        """Explicit [] is distinct from None and is permitted."""
        payload = _canonical_output()
        payload["causal_attributions"] = []
        model = InvestigatorOutput.model_validate(payload)
        assert model.causal_attributions == []

    def test_accepts_populated_causal_attributions(self) -> None:
        payload = _canonical_output()
        payload["causal_attributions"] = [
            {
                "cell": {"rubrique": "63099000000000", "colonne": "10"},
                "attributed_rule_ax_term": "630",
                "attributed_rule_num_regle": 380,
            },
            {
                "cell": {"rubrique": "63099000000000", "colonne": "10"},
                "attributed_rule_ax_term": "630",
                "attributed_rule_num_regle": 382,
            },
        ]
        model = InvestigatorOutput.model_validate(payload)
        assert model.causal_attributions is not None
        assert len(model.causal_attributions) == 2
        assert model.causal_attributions[0].attributed_rule_num_regle == 380

    def test_rejects_duplicate_cell_rule_pair(self) -> None:
        """Two entries for the same (cell, ax_term, num_regle) tuple
        are noise — Pydantic structure rejects them so the guard
        does not have to dedupe."""
        payload = _canonical_output()
        payload["causal_attributions"] = [
            {
                "cell": {"rubrique": "PA01", "colonne": "C1"},
                "attributed_rule_ax_term": "630",
                "attributed_rule_num_regle": 330,
            },
            {
                "cell": {"rubrique": "PA01", "colonne": "C1"},
                "attributed_rule_ax_term": "630",
                "attributed_rule_num_regle": 330,
            },
        ]
        with pytest.raises(ValidationError):
            InvestigatorOutput.model_validate(payload)

    def test_accepts_same_cell_different_rules(self) -> None:
        """Same cell attributed to TWO distinct rules is legitimate
        (a cell may be incriminated by multiple rules); only the
        full (cell, ax_term, num_regle) tuple must be unique."""
        payload = _canonical_output()
        payload["causal_attributions"] = [
            {
                "cell": {"rubrique": "PA01", "colonne": "C1"},
                "attributed_rule_ax_term": "630",
                "attributed_rule_num_regle": 330,
            },
            {
                "cell": {"rubrique": "PA01", "colonne": "C1"},
                "attributed_rule_ax_term": "630",
                "attributed_rule_num_regle": 380,
            },
        ]
        model = InvestigatorOutput.model_validate(payload)
        assert model.causal_attributions is not None
        assert len(model.causal_attributions) == 2


class TestEnumDistinction:
    def test_severity_and_rule_outcome_are_distinct_enums(self) -> None:
        # Severity is for FAIL rows only; RuleOutcomeInRun is for the
        # cross-rule calculator. They share no values.
        severity_values = {member.value for member in Severity}
        outcome_values = {member.value for member in RuleOutcomeInRun}
        assert severity_values == {"severe", "rounding"}
        assert outcome_values == {"pass", "fail_severe", "fail_rounding", "skipped"}
        assert severity_values.isdisjoint(outcome_values)


class TestRubriqueConfidence:
    def test_has_no_rang_field(self) -> None:
        # CTO blocker 2: the cross-rule key is (annexe, rubrique, colonne)
        # without rang. Confirm the model has NO `rang` attribute even
        # by reflection on its fields.
        assert "rang" not in RubriqueConfidence.model_fields

    def test_score_is_string(self) -> None:
        rc = RubriqueConfidence.model_validate(
            {
                "annexe_code": "RSM630",
                "rubrique_code": "PA01",
                "colonne_code": "C1",
                "score": "1.0",
                "contributing_rules_count": 2,
                "classification": "innocent",
                "contributing_rule_ids": [],
            }
        )
        assert isinstance(rc.score, str)
        assert rc.score == "1.0"

    def test_serialises_score_as_string(self) -> None:
        rc = RubriqueConfidence.model_validate(
            {
                "annexe_code": "RSM630",
                "rubrique_code": "PA01",
                "colonne_code": "C1",
                "score": "0.99999999999999999999999999999999999999",
                "contributing_rules_count": 2,
                "classification": "innocent",
                "contributing_rule_ids": [],
            }
        )
        dumped = rc.model_dump()
        assert isinstance(dumped["score"], str)
        assert dumped["score"] == "0.99999999999999999999999999999999999999"


class TestTerm:
    def test_status_default_is_present(self) -> None:
        t = Term.model_validate(
            {"rang": 1, "role": "lhs", "rubrique_code": "PA01", "colonne_code": "C1"}
        )
        assert t.status is TermStatus.PRESENT

    def test_rejects_invalid_status(self) -> None:
        with pytest.raises(ValidationError):
            Term.model_validate(
                {
                    "rang": 1,
                    "role": "lhs",
                    "rubrique_code": "PA01",
                    "colonne_code": "C1",
                    "status": "deleted",
                }
            )
