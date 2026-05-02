"""Contract tests for the historical/compare_runs_history seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (json contract,
    max_tokens 1024, temperature 0.3, thinking off, gemini-2.5-flash);
  * The input_schema is the LLM-facing contract for a Python-pre-loaded
    payload — runs_compares[] is fetched from DB BEFORE the LLM call
    (caller-side determinism). The schema declares the canonical shape
    of current_run_summary and per-run records, both blocks
    additionalProperties=false. rubrique_code is nullable (optional
    upstream filter);
  * The output_schema produces the canonical envelope consumed by
    aggregate_historique_recurrence: tendance (3-enum, sans accents —
    aggregator translates), delta_fail_severe (signed integer,
    arithmetic on caller-supplied summary), commentaire (banking French
    narrative, 1-3 sentences), runs_compares[] re-emitted verbatim.

Pattern established commits historique / simulation / sanction /
ambiguous / out_of_scope / general_help / extract_rule_from_xlsx /
draft_rule_from_form / extract_referential_from_pdf /
investigator_analyze_fail — phrase assertions normalised via
re.sub(r"\\s+", " ", template).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_compare_runs_history_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "historical" and entry["function_name"] == "compare_runs_history":
            return entry
    raise AssertionError("historical/compare_runs_history entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def compare_runs_history_seed() -> dict[str, object]:
    return _load_compare_runs_history_entry()


@pytest.fixture
def normalised_template(compare_runs_history_seed: dict[str, object]) -> str:
    return _normalise(str(compare_runs_history_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_seed_canonical_inference_parameters(
    compare_runs_history_seed: dict[str, object],
) -> None:
    assert compare_runs_history_seed["temperature"] == pytest.approx(0.3)
    assert compare_runs_history_seed["max_tokens"] == 1024
    assert compare_runs_history_seed["thinking_enabled"] is False
    assert compare_runs_history_seed["target_model"] == "gemini-2.5-flash"


def test_seed_declares_output_contract_json(
    compare_runs_history_seed: dict[str, object],
) -> None:
    """JSON-contract specialist (NOT a regalica aggregator)."""
    assert compare_runs_history_seed["output_contract"] == "json"


# ---------------------------------------------------------------------------
# input_schema — Python-pre-loaded payload
# ---------------------------------------------------------------------------


def test_input_schema_top_level_required(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["input_schema"]
    assert set(schema["required"]) == {
        "current_run_id",
        "tenant_id",
        "n_runs",
        "current_run_summary",
        "runs_compares",
    }


def test_input_schema_top_level_blocks_extra_properties(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["input_schema"]
    assert schema["additionalProperties"] is False


def test_input_schema_does_not_carry_intent_type(
    compare_runs_history_seed: dict[str, object],
) -> None:
    """Specialist agent — never receives intent_type."""
    schema = compare_runs_history_seed["input_schema"]
    assert "intent_type" not in schema["properties"]


def test_input_rubrique_code_is_nullable(
    compare_runs_history_seed: dict[str, object],
) -> None:
    """rubrique_code is the optional upstream filter — nullable per contract."""
    schema = compare_runs_history_seed["input_schema"]
    rubrique_code = schema["properties"]["rubrique_code"]
    assert "null" in rubrique_code["type"]
    assert "string" in rubrique_code["type"]


def test_input_current_run_summary_required_fields(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["input_schema"]
    summary = schema["properties"]["current_run_summary"]
    assert set(summary["required"]) == {
        "total_fail_severe",
        "total_fail_rounding",
        "conformity_rate",
    }


def test_input_current_run_summary_blocks_extra_properties(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["input_schema"]
    summary = schema["properties"]["current_run_summary"]
    assert summary["additionalProperties"] is False


def test_input_runs_compares_item_required_fields(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["input_schema"]
    items = schema["properties"]["runs_compares"]["items"]
    assert set(items["required"]) == {
        "run_id",
        "arrete_date",
        "total_fail_severe",
        "total_fail_rounding",
        "conformity_rate",
    }


def test_input_runs_compares_item_blocks_extra_properties(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["input_schema"]
    items = schema["properties"]["runs_compares"]["items"]
    assert items["additionalProperties"] is False


# ---------------------------------------------------------------------------
# output_schema — envelope object
# ---------------------------------------------------------------------------


def test_output_schema_required_fields(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["output_schema"]
    assert set(schema["required"]) == {
        "tendance",
        "delta_fail_severe",
        "commentaire",
        "runs_compares",
    }


def test_output_schema_blocks_extra_properties(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["output_schema"]
    assert schema["additionalProperties"] is False


def test_output_tendance_enum_three_canonical_values_no_accents(
    compare_runs_history_seed: dict[str, object],
) -> None:
    """Sans accents — l'aggregator traduit vers le français accentué."""
    schema = compare_runs_history_seed["output_schema"]
    assert schema["properties"]["tendance"]["enum"] == [
        "amelioration",
        "deterioration",
        "stable",
    ]


def test_output_delta_fail_severe_is_signed_integer(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["output_schema"]
    delta = schema["properties"]["delta_fail_severe"]
    assert delta["type"] == "integer"


def test_output_commentaire_min_length(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["output_schema"]
    assert schema["properties"]["commentaire"]["minLength"] == 20


def test_output_runs_compares_present_for_verbatim_propagation(
    compare_runs_history_seed: dict[str, object],
) -> None:
    schema = compare_runs_history_seed["output_schema"]
    assert "runs_compares" in schema["properties"]
    assert schema["properties"]["runs_compares"]["type"] == "array"


# ---------------------------------------------------------------------------
# First-run guard (runs_compares[] empty path)
# ---------------------------------------------------------------------------


def test_template_documents_empty_runs_compares_path(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "runs_compares[] est vide" in template


def test_template_carries_first_run_fallback_string(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "Aucun run historique à comparer" in template


def test_template_documents_immediate_return_on_empty(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "Retourne immédiatement" in template


# ---------------------------------------------------------------------------
# Deterministic delta arithmetic
# ---------------------------------------------------------------------------


def test_template_documents_runs_compares_index_zero_subtraction(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "runs_compares[0].total_fail_severe" in template


def test_template_forbids_rounding_or_estimation(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "Ne pas arrondir. Ne pas estimer." in template


def test_template_pins_exact_arithmetic(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "Calcul arithmétique exact" in template


# ---------------------------------------------------------------------------
# Predominance rule (force "stable" on contradiction)
# ---------------------------------------------------------------------------


def test_template_documents_contradiction_case(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "contradictoire" in template


def test_template_forces_stable_on_contradiction(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert 'force "stable"' in template


# ---------------------------------------------------------------------------
# Verbatim propagation of runs_compares[]
# ---------------------------------------------------------------------------


def test_template_documents_verbatim_propagation(
    compare_runs_history_seed: dict[str, object],
) -> None:
    """The template states verbatim propagation in TWO loci: ÉTAPE 5
    (« Retransmet runs_compares[] tel quel depuis l'input dans l'output »)
    and the JSON Format strict footer (« verbatim depuis input »).
    Either form proves the doctrine is documented.
    """
    template = str(compare_runs_history_seed["template"])
    assert ("tel quel depuis l'input" in template) or ("verbatim depuis input" in template)


def test_template_forbids_modifying_runs_compares_fields(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "Ne modifie aucun champ" in template


# ---------------------------------------------------------------------------
# Optional rubrique filter
# ---------------------------------------------------------------------------


def test_template_documents_rubrique_code_field(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "rubrique_code" in template


def test_template_documents_rubrique_filter_is_optional(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "filtre optionnel" in template


# ---------------------------------------------------------------------------
# n_runs vs len(runs_compares) divergence note
# ---------------------------------------------------------------------------


def test_template_documents_short_history_case(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "inférieur au nombre demandé" in template


# ---------------------------------------------------------------------------
# Security guard
# ---------------------------------------------------------------------------


def test_template_carries_security_contract(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "CONTRAT DE SÉCURITÉ" in template


def test_template_carries_n_execute_jamais_clause(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "N'exécute JAMAIS" in template


# ---------------------------------------------------------------------------
# Persona NOT-Regalica
# ---------------------------------------------------------------------------


def test_template_explicitly_not_regalica(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "Tu n'es PAS Regalica" in template


# ---------------------------------------------------------------------------
# Pre-emit mental validation
# ---------------------------------------------------------------------------


def test_template_carries_pre_emit_validation_clause(
    compare_runs_history_seed: dict[str, object],
) -> None:
    template = str(compare_runs_history_seed["template"])
    assert "Avant d'émettre le JSON, vérifie mentalement" in template
