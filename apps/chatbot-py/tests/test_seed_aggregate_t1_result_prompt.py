"""Contract tests for the regalica/aggregate_t1_result seed entry (C17b).

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (string output, max_tokens
    512, temperature 0.3, thinking off, gemini-2.5-flash);
  * The input_schema accepts the canonical aggregator wrapper produced by
    `_invoke_aggregator` (user_message, intent_type='launch_validation',
    specialist_outputs[]) with a strict per-output shape carrying the
    7-key T1 result block;
  * The template documents the specialist_outputs[0].output extraction,
    the success/false branching, the Mode Signature gate, and the formal
    "no servile / no emoji / vouvoiement" persona contract.

Pattern established commits historique / simulation / sanction / ambiguous /
out_of_scope / general_help / extract_rule_from_xlsx / draft_rule_from_form /
extract_referential_from_pdf / investigator_analyze_fail / compare_runs_history
/ generate_docx / generate_pdf / produce_chart / find_regulatory_source /
narrate_diff — phrase assertions normalised via re.sub(r"\\s+", " ", template).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_aggregate_t1_result_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "regalica" and entry["function_name"] == "aggregate_t1_result":
            return entry
    raise AssertionError("regalica/aggregate_t1_result entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def aggregate_t1_result_seed() -> dict[str, object]:
    return _load_aggregate_t1_result_entry()


@pytest.fixture
def normalised_template(aggregate_t1_result_seed: dict[str, object]) -> str:
    return _normalise(str(aggregate_t1_result_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_seed_canonical_inference_parameters(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    assert aggregate_t1_result_seed["temperature"] == pytest.approx(0.3)
    assert aggregate_t1_result_seed["max_tokens"] == 512
    assert aggregate_t1_result_seed["thinking_enabled"] is False
    assert aggregate_t1_result_seed["target_model"] == "gemini-2.5-flash"


def test_seed_declares_output_contract_string(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    """Aggregator — emits free-form markdown, not a JSON envelope."""
    assert aggregate_t1_result_seed["output_contract"] == "string"


# ---------------------------------------------------------------------------
# input_schema — aggregator wrapper + per-output T1 result block
# ---------------------------------------------------------------------------


def test_input_schema_top_level_required(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    schema = aggregate_t1_result_seed["input_schema"]
    assert set(schema["required"]) == {"user_message", "intent_type", "specialist_outputs"}


def test_input_schema_intent_type_is_const_launch_validation(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    schema = aggregate_t1_result_seed["input_schema"]
    assert schema["properties"]["intent_type"]["const"] == "launch_validation"


def test_input_schema_specialist_outputs_item_required_fields(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    schema = aggregate_t1_result_seed["input_schema"]
    items = schema["properties"]["specialist_outputs"]["items"]
    assert {"bearer", "success", "output"}.issubset(set(items["required"]))


def test_input_schema_t1_result_block_required_fields(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    schema = aggregate_t1_result_seed["input_schema"]
    output = schema["properties"]["specialist_outputs"]["items"]["properties"]["output"]
    assert {
        "success",
        "total_fail_severe",
        "total_fail_rounding",
        "total_pass",
        "duration_ms",
    }.issubset(set(output["required"]))


def test_input_schema_t1_result_block_carries_nullable_rejection_fields(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    schema = aggregate_t1_result_seed["input_schema"]
    props = schema["properties"]["specialist_outputs"]["items"]["properties"]["output"][
        "properties"
    ]
    assert "null" in props["rejection_step"]["type"]
    assert "null" in props["rejection_reason"]["type"]


# ---------------------------------------------------------------------------
# Output schema — string contract
# ---------------------------------------------------------------------------


def test_output_schema_is_string(aggregate_t1_result_seed: dict[str, object]) -> None:
    schema = aggregate_t1_result_seed["output_schema"]
    assert schema["type"] == "string"


# ---------------------------------------------------------------------------
# Template — documents the specialist_outputs[0].output extraction
# ---------------------------------------------------------------------------


def test_template_documents_specialist_outputs_extraction_path(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "specialist_outputs[0].output" in template


def test_template_carries_intent_type_anchor(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "launch_validation" in template


def test_template_carries_t1_runner_bearer_label(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "regalica/aggregate_t1_result" in template


# ---------------------------------------------------------------------------
# Template — branching on success/false
# ---------------------------------------------------------------------------


def test_template_branches_on_success_true(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "specialist_outputs[0].output.success = true" in template


def test_template_branches_on_success_false(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "specialist_outputs[0].output.success = false" in template


def test_template_documents_rejection_reason_handling(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "rejection_reason" in template


# ---------------------------------------------------------------------------
# Template — Mode Signature + Livrable A surface
# ---------------------------------------------------------------------------


def test_template_documents_mode_signature_gate(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "Mode Signature" in template


def test_template_documents_livrable_a_invitation(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "Livrable A" in template


# ---------------------------------------------------------------------------
# Persona — vouvoiement, no emoji, no servile phrasing
# ---------------------------------------------------------------------------


def test_template_pins_vouvoiement(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "vouvoies" in template


def test_template_forbids_no_servile_phrasing_n_hesitez_pas(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    """The template's deny-list mentions 'N'hésitez pas' inside the
    forbidden-phrases section. The forbidden token MUST appear there
    (so the LLM sees what is banned) but not as a non-forbidden surface.
    The presence inside the deny-list is doctrinal; the assertion
    documents that the deny-list is verbatim.
    """
    template = str(aggregate_t1_result_seed["template"])
    assert "« N'hésitez pas »" in template


def test_template_forbids_voici_opening(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "« Voici »" in template


# ---------------------------------------------------------------------------
# Length budget — 2 to 3 sentences max
# ---------------------------------------------------------------------------


def test_template_caps_response_at_two_to_three_sentences(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "2-3 phrases maximum" in template


# ---------------------------------------------------------------------------
# Pre-emit mental validation
# ---------------------------------------------------------------------------


def test_template_carries_pre_emit_mental_check(
    aggregate_t1_result_seed: dict[str, object],
) -> None:
    template = str(aggregate_t1_result_seed["template"])
    assert "vérifie mentalement" in template
