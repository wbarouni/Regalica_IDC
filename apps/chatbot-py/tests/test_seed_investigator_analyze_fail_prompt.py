"""Contract tests for the investigator/analyze_fail seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (json contract,
    max_tokens 4096, temperature 0.3, thinking off, gemini-2.5-flash);
  * The input_schema accepts a verdict block (engine output) and a rule
    block (RDG metadata) plus a tenant_id, and BOTH nested blocks declare
    additionalProperties=false. The engine field type_ctrl is nullable
    AND the template explicitly warns that ~13% of the values are wrong;
  * The output_schema produces the canonical specialist envelope consumed
    by aggregate_zoom_fail / aggregate_grappe_cause_racine /
    aggregate_plan_optimal: explanation_fr, severity (3-enum), 6-enum
    probable_root_cause, suggested_actions (1..3), confidence,
    lhs/rhs/gap/gap_relative (verbatim from verdict — never recomputed),
    rubriques[], citations[] capped at 1 INDICATIVE entry (distinct from
    CitationAgent's vector-verified citations).

Pattern established commits historique / simulation / sanction /
ambiguous / out_of_scope / general_help / extract_rule_from_xlsx /
draft_rule_from_form / extract_referential_from_pdf — phrase assertions
normalised via re.sub(r"\\s+", " ", template).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_analyze_fail_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "investigator" and entry["function_name"] == "analyze_fail":
            return entry
    raise AssertionError("investigator/analyze_fail entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def analyze_fail_seed() -> dict[str, object]:
    return _load_analyze_fail_entry()


@pytest.fixture
def normalised_template(analyze_fail_seed: dict[str, object]) -> str:
    return _normalise(str(analyze_fail_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_seed_canonical_inference_parameters(analyze_fail_seed: dict[str, object]) -> None:
    assert analyze_fail_seed["temperature"] == pytest.approx(0.3)
    assert analyze_fail_seed["max_tokens"] == 4096
    assert analyze_fail_seed["thinking_enabled"] is False
    assert analyze_fail_seed["target_model"] == "gemini-2.5-flash"


def test_seed_declares_output_contract_json(analyze_fail_seed: dict[str, object]) -> None:
    """JSON-contract specialist (NOT a regalica aggregator)."""
    assert analyze_fail_seed["output_contract"] == "json"


# ---------------------------------------------------------------------------
# input_schema — verdict + rule blocks
# ---------------------------------------------------------------------------


def test_input_schema_top_level_required(analyze_fail_seed: dict[str, object]) -> None:
    schema = analyze_fail_seed["input_schema"]
    assert set(schema["required"]) == {"verdict", "rule", "tenant_id"}


def test_input_schema_top_level_blocks_extra_properties(
    analyze_fail_seed: dict[str, object],
) -> None:
    schema = analyze_fail_seed["input_schema"]
    assert schema["additionalProperties"] is False


def test_input_schema_does_not_carry_intent_type(
    analyze_fail_seed: dict[str, object],
) -> None:
    """Specialist agent — never receives intent_type."""
    schema = analyze_fail_seed["input_schema"]
    assert "intent_type" not in schema["properties"]


def test_input_verdict_required_fields(analyze_fail_seed: dict[str, object]) -> None:
    verdict = analyze_fail_seed["input_schema"]["properties"]["verdict"]
    assert set(verdict["required"]) == {"ax_term", "num_regle", "lhs", "rhs", "gap"}


def test_input_verdict_blocks_extra_properties(analyze_fail_seed: dict[str, object]) -> None:
    verdict = analyze_fail_seed["input_schema"]["properties"]["verdict"]
    assert verdict["additionalProperties"] is False


def test_input_verdict_type_ctrl_is_nullable(analyze_fail_seed: dict[str, object]) -> None:
    """type_ctrl carries ~13% errors per RDG legacy — nullable + warned in template."""
    verdict = analyze_fail_seed["input_schema"]["properties"]["verdict"]
    type_ctrl = verdict["properties"]["type_ctrl"]
    assert "null" in type_ctrl["type"]
    assert "string" in type_ctrl["type"]


def test_input_verdict_gap_relative_is_nullable(analyze_fail_seed: dict[str, object]) -> None:
    verdict = analyze_fail_seed["input_schema"]["properties"]["verdict"]
    gap_rel = verdict["properties"]["gap_relative"]
    assert "null" in gap_rel["type"]
    assert "number" in gap_rel["type"]


def test_input_rule_required_fields(analyze_fail_seed: dict[str, object]) -> None:
    rule = analyze_fail_seed["input_schema"]["properties"]["rule"]
    assert set(rule["required"]) == {"expression", "rubriques", "annexe_code"}


def test_input_rule_blocks_extra_properties(analyze_fail_seed: dict[str, object]) -> None:
    rule = analyze_fail_seed["input_schema"]["properties"]["rule"]
    assert rule["additionalProperties"] is False


# ---------------------------------------------------------------------------
# output_schema — envelope object
# ---------------------------------------------------------------------------


def test_output_schema_required_fields(analyze_fail_seed: dict[str, object]) -> None:
    schema = analyze_fail_seed["output_schema"]
    assert set(schema["required"]) == {
        "explanation_fr",
        "severity",
        "probable_root_cause",
        "suggested_actions",
        "confidence",
        "rubriques",
        "citations",
    }


def test_output_schema_blocks_extra_properties(analyze_fail_seed: dict[str, object]) -> None:
    schema = analyze_fail_seed["output_schema"]
    assert schema["additionalProperties"] is False


def test_output_severity_enum_is_three_canonical_values(
    analyze_fail_seed: dict[str, object],
) -> None:
    schema = analyze_fail_seed["output_schema"]
    assert schema["properties"]["severity"]["enum"] == ["BLOQUANT", "MAJEUR", "MINEUR"]


def test_output_probable_root_cause_enum_is_six_canonical_values(
    analyze_fail_seed: dict[str, object],
) -> None:
    schema = analyze_fail_seed["output_schema"]
    assert schema["properties"]["probable_root_cause"]["enum"] == [
        "MAPPING_ERROR",
        "SOURCE_DATA",
        "BATCH_PROCESSING",
        "PERIMETER_CHANGE",
        "CONFIGURATION",
        "UNKNOWN",
    ]


def test_output_suggested_actions_bounds(analyze_fail_seed: dict[str, object]) -> None:
    schema = analyze_fail_seed["output_schema"]
    actions = schema["properties"]["suggested_actions"]
    assert actions["minItems"] == 1
    assert actions["maxItems"] == 3


def test_output_citations_capped_at_one(analyze_fail_seed: dict[str, object]) -> None:
    """0-1 INDICATIVE citation — distinct from CitationAgent's verified citations."""
    schema = analyze_fail_seed["output_schema"]
    assert schema["properties"]["citations"]["maxItems"] == 1


@pytest.mark.parametrize(
    "source_type",
    ["circulaire_bct", "cc_tech", "rdg_annexe"],
)
def test_output_citations_source_type_enum(
    analyze_fail_seed: dict[str, object], source_type: str
) -> None:
    schema = analyze_fail_seed["output_schema"]
    items = schema["properties"]["citations"]["items"]
    assert source_type in items["properties"]["source_type"]["enum"]


@pytest.mark.parametrize(
    "field",
    ["lhs", "rhs", "gap", "gap_relative"],
)
def test_output_numeric_fields_are_nullable(
    analyze_fail_seed: dict[str, object], field: str
) -> None:
    schema = analyze_fail_seed["output_schema"]
    field_schema = schema["properties"][field]
    assert "null" in field_schema["type"]
    assert "number" in field_schema["type"]


def test_output_confidence_bounds(analyze_fail_seed: dict[str, object]) -> None:
    schema = analyze_fail_seed["output_schema"]
    conf = schema["properties"]["confidence"]
    assert conf["minimum"] == 0.0
    assert conf["maximum"] == 1.0


def test_output_rubriques_items_required_fields(analyze_fail_seed: dict[str, object]) -> None:
    schema = analyze_fail_seed["output_schema"]
    items = schema["properties"]["rubriques"]["items"]
    assert set(items["required"]) == {"code", "libelle"}


# ---------------------------------------------------------------------------
# Avertissement TYPE_CTRL
# ---------------------------------------------------------------------------


def test_template_carries_type_ctrl_warning_section(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "AVERTISSEMENT TYPE_CTRL" in template


def test_template_documents_type_ctrl_error_rate(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "~13% d'erreurs" in template


def test_template_forbids_type_ctrl_as_sole_severity_source(
    normalised_template: str,
) -> None:
    assert "Ne l'utilise JAMAIS comme seule source" in normalised_template


# ---------------------------------------------------------------------------
# 8-step procedure
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "step",
    [
        "ÉTAPE 1",
        "ÉTAPE 2",
        "ÉTAPE 3",
        "ÉTAPE 4",
        "ÉTAPE 5",
        "ÉTAPE 6",
        "ÉTAPE 7",
        "ÉTAPE 8",
    ],
)
def test_template_carries_eight_etapes(analyze_fail_seed: dict[str, object], step: str) -> None:
    template = str(analyze_fail_seed["template"])
    assert step in template


# ---------------------------------------------------------------------------
# Severity criteria documented
# ---------------------------------------------------------------------------


def test_template_documents_bloquant_severity(analyze_fail_seed: dict[str, object]) -> None:
    template = str(analyze_fail_seed["template"])
    assert "BLOQUANT" in template


def test_template_documents_bloquant_relative_threshold(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "gap_relative > 10%" in template


def test_template_documents_mineur_severity(analyze_fail_seed: dict[str, object]) -> None:
    template = str(analyze_fail_seed["template"])
    assert "MINEUR" in template


def test_template_documents_mineur_rounding_path(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "arrondi probable" in template


# ---------------------------------------------------------------------------
# Root-cause enum documented
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "code",
    ["MAPPING_ERROR", "BATCH_PROCESSING", "PERIMETER_CHANGE", "UNKNOWN"],
)
def test_template_documents_root_cause_code(
    analyze_fail_seed: dict[str, object], code: str
) -> None:
    template = str(analyze_fail_seed["template"])
    assert code in template


# ---------------------------------------------------------------------------
# Verbatim numeric propagation
# ---------------------------------------------------------------------------


def test_template_documents_verbatim_lhs_propagation(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "Retransmet verdict.lhs" in template


def test_template_forbids_recalculating_engine_values(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "Ne recalcule JAMAIS" in template


def test_template_pins_engine_as_source_of_truth(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "source de vérité" in template


# ---------------------------------------------------------------------------
# Citation indicative
# ---------------------------------------------------------------------------


def test_template_marks_citation_as_indicative(analyze_fail_seed: dict[str, object]) -> None:
    template = str(analyze_fail_seed["template"])
    assert "INDICATIVE" in template


def test_template_forbids_fabricated_citation_reference(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "Ne fabrique JAMAIS une référence" in template


def test_template_documents_empty_citations_fallback(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "citations = []" in template


# ---------------------------------------------------------------------------
# Security + ZONE_TEXTE null guard
# ---------------------------------------------------------------------------


def test_template_carries_security_contract(analyze_fail_seed: dict[str, object]) -> None:
    template = str(analyze_fail_seed["template"])
    assert "CONTRAT DE SÉCURITÉ" in template


def test_template_documents_zone_texte_null_path(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "ZONE_TEXTE" in template


# ---------------------------------------------------------------------------
# Cross-prompt coherence with aggregate_zoom_fail
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "field",
    ["explanation_fr", "probable_root_cause", "suggested_actions"],
)
def test_output_schema_coherent_with_aggregate_zoom_fail(
    analyze_fail_seed: dict[str, object], field: str
) -> None:
    """aggregate_zoom_fail consumes these keys verbatim from
    investigator.output — see its INPUT REÇU section.
    """
    schema = analyze_fail_seed["output_schema"]
    assert field in schema["properties"]


# ---------------------------------------------------------------------------
# Pre-emit mental validation + persona
# ---------------------------------------------------------------------------


def test_template_carries_pre_emit_validation_clause(
    analyze_fail_seed: dict[str, object],
) -> None:
    template = str(analyze_fail_seed["template"])
    assert "Avant d'émettre le JSON, vérifie mentalement" in template


def test_template_explicitly_not_regalica(analyze_fail_seed: dict[str, object]) -> None:
    template = str(analyze_fail_seed["template"])
    assert "Tu n'es PAS Regalica" in template
