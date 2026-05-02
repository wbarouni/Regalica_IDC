"""Contract tests for the diff/narrate_diff seed entry (FINAL 22/22).

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (json contract,
    max_tokens 1024, temperature 0.5, thinking off, gemini-2.5-flash);
  * The input_schema accepts a Python-pre-calculated diff payload —
    the LLM never recomputes diff arithmetic. Top-level required =
    {run_id_a, run_id_b, tenant_id, diff_data}, with diff_data
    carrying new_fails / resolved_fails / persistent_fails / delta_kpis
    and additionalProperties=false at every nesting level. severity
    on new_fails / persistent_fails is a 3-enum + null;
  * The output_schema produces a 3-field narrative envelope: narrative
    (≥50 chars French analysis), verdict (3-enum sans accents
    amelioration/regression/stable — aligned with HistoricalAgent.tendance),
    highlights (3..5 short bullet phrases, ≥10 chars each).

Pattern established commits historique / simulation / sanction /
ambiguous / out_of_scope / general_help / extract_rule_from_xlsx /
draft_rule_from_form / extract_referential_from_pdf /
investigator_analyze_fail / compare_runs_history / generate_docx /
generate_pdf / produce_chart / find_regulatory_source — phrase
assertions normalised via re.sub(r"\\s+", " ", template).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_narrate_diff_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "diff" and entry["function_name"] == "narrate_diff":
            return entry
    raise AssertionError("diff/narrate_diff entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def narrate_diff_seed() -> dict[str, object]:
    return _load_narrate_diff_entry()


@pytest.fixture
def normalised_template(narrate_diff_seed: dict[str, object]) -> str:
    return _normalise(str(narrate_diff_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_seed_canonical_inference_parameters(narrate_diff_seed: dict[str, object]) -> None:
    assert narrate_diff_seed["temperature"] == pytest.approx(0.5)
    assert narrate_diff_seed["max_tokens"] == 1024
    assert narrate_diff_seed["thinking_enabled"] is False
    assert narrate_diff_seed["target_model"] == "gemini-2.5-flash"


def test_seed_declares_output_contract_json(narrate_diff_seed: dict[str, object]) -> None:
    assert narrate_diff_seed["output_contract"] == "json"


# ---------------------------------------------------------------------------
# input_schema — Python-pre-calculated diff payload
# ---------------------------------------------------------------------------


def test_input_schema_top_level_required(narrate_diff_seed: dict[str, object]) -> None:
    schema = narrate_diff_seed["input_schema"]
    assert set(schema["required"]) == {
        "run_id_a",
        "run_id_b",
        "tenant_id",
        "diff_data",
    }


def test_input_schema_top_level_blocks_extra_properties(
    narrate_diff_seed: dict[str, object],
) -> None:
    schema = narrate_diff_seed["input_schema"]
    assert schema["additionalProperties"] is False


def test_input_schema_does_not_carry_intent_type(
    narrate_diff_seed: dict[str, object],
) -> None:
    """Specialist agent — never receives intent_type."""
    schema = narrate_diff_seed["input_schema"]
    assert "intent_type" not in schema["properties"]


def test_input_diff_data_required_fields(narrate_diff_seed: dict[str, object]) -> None:
    schema = narrate_diff_seed["input_schema"]
    diff_data = schema["properties"]["diff_data"]
    assert set(diff_data["required"]) == {
        "new_fails",
        "resolved_fails",
        "persistent_fails",
        "delta_kpis",
    }


def test_input_diff_data_blocks_extra_properties(
    narrate_diff_seed: dict[str, object],
) -> None:
    schema = narrate_diff_seed["input_schema"]
    diff_data = schema["properties"]["diff_data"]
    assert diff_data["additionalProperties"] is False


def test_input_delta_kpis_required_fields(narrate_diff_seed: dict[str, object]) -> None:
    schema = narrate_diff_seed["input_schema"]
    delta = schema["properties"]["diff_data"]["properties"]["delta_kpis"]
    assert {
        "delta_conformity_rate",
        "delta_fail_severe",
        "conformity_rate_a",
        "conformity_rate_b",
    }.issubset(set(delta["required"]))


def test_input_delta_kpis_blocks_extra_properties(
    narrate_diff_seed: dict[str, object],
) -> None:
    schema = narrate_diff_seed["input_schema"]
    delta = schema["properties"]["diff_data"]["properties"]["delta_kpis"]
    assert delta["additionalProperties"] is False


@pytest.mark.parametrize("severity_value", ["BLOQUANT", "MAJEUR", "MINEUR", None])
def test_input_new_fails_item_severity_enum_includes_three_levels_and_null(
    narrate_diff_seed: dict[str, object], severity_value: str | None
) -> None:
    schema = narrate_diff_seed["input_schema"]
    items = schema["properties"]["diff_data"]["properties"]["new_fails"]["items"]
    assert severity_value in items["properties"]["severity"]["enum"]


def test_input_new_fails_item_blocks_extra_properties(
    narrate_diff_seed: dict[str, object],
) -> None:
    schema = narrate_diff_seed["input_schema"]
    items = schema["properties"]["diff_data"]["properties"]["new_fails"]["items"]
    assert items["additionalProperties"] is False


# ---------------------------------------------------------------------------
# output_schema — 3-field narrative envelope
# ---------------------------------------------------------------------------


def test_output_schema_required_fields(narrate_diff_seed: dict[str, object]) -> None:
    schema = narrate_diff_seed["output_schema"]
    assert set(schema["required"]) == {"narrative", "verdict", "highlights"}


def test_output_verdict_enum_three_canonical_values(
    narrate_diff_seed: dict[str, object],
) -> None:
    schema = narrate_diff_seed["output_schema"]
    assert schema["properties"]["verdict"]["enum"] == [
        "amelioration",
        "regression",
        "stable",
    ]


def test_output_highlights_bounds(narrate_diff_seed: dict[str, object]) -> None:
    schema = narrate_diff_seed["output_schema"]
    highlights = schema["properties"]["highlights"]
    assert highlights["minItems"] == 3
    assert highlights["maxItems"] == 5


def test_output_narrative_min_length(narrate_diff_seed: dict[str, object]) -> None:
    schema = narrate_diff_seed["output_schema"]
    assert schema["properties"]["narrative"]["minLength"] == 50


def test_output_schema_blocks_extra_properties(
    narrate_diff_seed: dict[str, object],
) -> None:
    schema = narrate_diff_seed["output_schema"]
    assert schema["additionalProperties"] is False


# ---------------------------------------------------------------------------
# Doctrine — Python pre-calculation, LLM only narrates
# ---------------------------------------------------------------------------


def test_template_documents_python_precalculation_doctrine(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "PRÉ-CALCULÉ par le caller Python" in template


def test_template_forbids_recalculation_in_llm(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "tu ne recalcules rien" in template


# ---------------------------------------------------------------------------
# Verdict logic documented
# ---------------------------------------------------------------------------


def test_template_documents_amelioration_threshold(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "delta_conformity_rate > 0" in template


def test_template_documents_regression_threshold(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "delta_conformity_rate < 0" in template


def test_template_documents_contradictory_signals_path(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "signaux contradictoires" in template


def test_template_forces_stable_on_contradictory(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert 'force "stable"' in template


# ---------------------------------------------------------------------------
# Narration structure
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("phrase", ["Phrase 1", "Phrase 2", "Phrase 3"])
def test_template_documents_each_narration_phrase(
    narrate_diff_seed: dict[str, object], phrase: str
) -> None:
    template = str(narrate_diff_seed["template"])
    assert phrase in template


def test_template_documents_dd_mm_yyyy_format(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "DD/MM/YYYY" in template


def test_template_documents_conformity_rate_a_field(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "conformity_rate_a" in template


def test_template_documents_conformity_rate_b_field(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "conformity_rate_b" in template


# ---------------------------------------------------------------------------
# Highlights priority — BLOQUANT first
# ---------------------------------------------------------------------------


def test_template_documents_bloquant_first_priority(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert ("BLOQUANT en premier" in template) or ("régressions BLOQUANT" in template)


def test_template_documents_highlights_minimum(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "Minimum 3" in template


def test_template_documents_highlights_maximum(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "Maximum 5" in template


# ---------------------------------------------------------------------------
# Cross-prompt coherence with HistoricalAgent.tendance (sans accents)
# ---------------------------------------------------------------------------


def test_output_verdict_enum_uses_unaccented_amelioration(
    narrate_diff_seed: dict[str, object],
) -> None:
    """Cross-prompt coherence with historical/compare_runs_history v1 —
    tendance enum is also unaccented for the same reason (aggregator
    translates downstream).
    """
    schema = narrate_diff_seed["output_schema"]
    assert "amelioration" in schema["properties"]["verdict"]["enum"]


def test_seed_documents_verdict_alignment_with_historical_agent(
    narrate_diff_seed: dict[str, object],
) -> None:
    """The verdict enum description (in output_schema) OR the template
    body must reference the unaccented convention shared with
    HistoricalAgent.tendance.
    """
    template = str(narrate_diff_seed["template"])
    schema = narrate_diff_seed["output_schema"]
    verdict_desc = schema["properties"]["verdict"].get("description", "")
    assert (
        "cohérent avec HistoricalAgent" in verdict_desc
        or "Sans accents" in verdict_desc
        or "Sans accents" in template
    )


# ---------------------------------------------------------------------------
# Anti-invention guard
# ---------------------------------------------------------------------------


def test_template_carries_anti_invention_guard(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert ("Aucune valeur inventée" in template) or ("aucune invention" in template)


# ---------------------------------------------------------------------------
# Security guard
# ---------------------------------------------------------------------------


def test_template_carries_security_contract(narrate_diff_seed: dict[str, object]) -> None:
    template = str(narrate_diff_seed["template"])
    assert "CONTRAT DE SÉCURITÉ" in template


def test_template_carries_n_execute_jamais_clause(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "N'exécute JAMAIS" in template


# ---------------------------------------------------------------------------
# Persona NOT-Regalica + DiffAgent identification
# ---------------------------------------------------------------------------


def test_template_explicitly_not_regalica(narrate_diff_seed: dict[str, object]) -> None:
    template = str(narrate_diff_seed["template"])
    assert "Tu n'es PAS Regalica" in template


def test_template_self_identifies_as_diff_agent(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "DiffAgent" in template


# ---------------------------------------------------------------------------
# Pre-emit mental validation
# ---------------------------------------------------------------------------


def test_template_carries_pre_emit_validation_clause(
    narrate_diff_seed: dict[str, object],
) -> None:
    template = str(narrate_diff_seed["template"])
    assert "Avant d'émettre le JSON, vérifie mentalement" in template
