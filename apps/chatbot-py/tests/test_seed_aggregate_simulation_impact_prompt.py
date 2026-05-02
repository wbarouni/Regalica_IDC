"""Contract tests for the regalica/aggregate_simulation_impact seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters and output_contract reflect the V1 contract
    (string, max_tokens 512, temp 0.5, thinking off);
  * The input schema declares `specialist_outputs.maxItems: 0` because
    intent_specialists.simulation has `specialist_ids=()` in canon
    migration 065 — V1 always receives an empty payload;
  * The template is an "honest unavailable" responder: it acknowledges
    the user's simulation request, signals the V1 limitation in
    technical wording, and offers exactly one workaround (XML re-upload).
    No invented numbers, no qualitative estimate, no temporal promise.

Pattern established commit grappe / historique / citation — every
multi-line phrase assertion is normalised via re.sub(r"\\s+", " ",
template) so a future re-indent of the JSON template body cannot
break the test set. Forbidden phrases that DO appear inside the
documentary deny-list / style-guard sections are asserted via
their framing, not via outright absence.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_simulation_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if (
            entry["agent_type"] == "regalica"
            and entry["function_name"] == "aggregate_simulation_impact"
        ):
            return entry
    raise AssertionError("regalica/aggregate_simulation_impact entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def simulation_seed() -> dict[str, object]:
    return _load_simulation_entry()


@pytest.fixture
def normalised_template(simulation_seed: dict[str, object]) -> str:
    return _normalise(str(simulation_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_simulation_seed_canonical_inference_parameters(
    simulation_seed: dict[str, object],
) -> None:
    assert simulation_seed["temperature"] == pytest.approx(0.5)
    assert simulation_seed["max_tokens"] == 512
    assert simulation_seed["thinking_enabled"] is False
    assert simulation_seed["target_model"] == "gemini-2.5-flash"


def test_simulation_seed_declares_output_contract_string(
    simulation_seed: dict[str, object],
) -> None:
    assert simulation_seed["output_contract"] == "string"


def test_simulation_seed_output_schema_is_string_with_bounds(
    simulation_seed: dict[str, object],
) -> None:
    schema = simulation_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 50
    assert schema["maxLength"] == 2000


# ---------------------------------------------------------------------------
# Input schema — V1 specifically pins maxItems: 0
# ---------------------------------------------------------------------------


def test_simulation_seed_input_intent_const_is_simulation(
    simulation_seed: dict[str, object],
) -> None:
    schema = simulation_seed["input_schema"]
    assert schema["properties"]["intent_type"]["const"] == "simulation"


def test_simulation_seed_input_specialist_outputs_maxitems_zero(
    simulation_seed: dict[str, object],
) -> None:
    """Migration 065 sets specialist_ids=() for the simulation intent.

    The schema enforces this at the prompt-input level: the LLM
    must never receive a non-empty specialist payload until V2
    rewires the intent grammar.
    """
    schema = simulation_seed["input_schema"]
    assert schema["properties"]["specialist_outputs"]["maxItems"] == 0


def test_simulation_seed_input_blocks_extra_properties(
    simulation_seed: dict[str, object],
) -> None:
    schema = simulation_seed["input_schema"]
    assert schema["additionalProperties"] is False


# ---------------------------------------------------------------------------
# Adjustments vs initial proposal — Section 1 = exactly 2 phrases
# ---------------------------------------------------------------------------


def test_template_section_1_is_exactly_two_phrases(simulation_seed: dict[str, object]) -> None:
    template = str(simulation_seed["template"])
    assert "SECTION 1 — Reconnaissance et indisponibilité V1 (2 phrases)" in template


def test_template_does_not_carry_phrase_3_optional_branch(
    simulation_seed: dict[str, object],
) -> None:
    """Phrase 3 was dropped from the final spec — assert removal."""
    template = str(simulation_seed["template"])
    assert "Phrase 3" not in template
    assert "Si l'utilisateur a explicitement demandé des chiffres" not in template


def test_template_does_not_carry_verbatim_acknowledgement_example(
    simulation_seed: dict[str, object],
) -> None:
    """The example "Vous souhaitez mesurer l'impact..." was rejected to avoid
    locking the LLM into a formulaic opener.
    """
    template = str(simulation_seed["template"])
    assert "Vous souhaitez mesurer l'impact d'une correction sur les verdicts" not in template


# ---------------------------------------------------------------------------
# V2 forward-compat documentary block
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "v2_field", ["baseline_run", "simulated_run", "diff_summary", "gap_evolutions"]
)
def test_template_documents_v2_payload_field(
    simulation_seed: dict[str, object], v2_field: str
) -> None:
    """V2 payload field names appear inside the forward-compat note,
    declaring the future contract without promising it as a V1 feature.
    """
    template = str(simulation_seed["template"])
    assert v2_field in template


def test_template_carries_forward_compat_marker(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "forward-compat" in template


# ---------------------------------------------------------------------------
# Two-section structure
# ---------------------------------------------------------------------------


def test_template_contains_two_sections_in_canonical_order(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    section_anchors = [
        "SECTION 1 — Reconnaissance et indisponibilité V1",
        "SECTION 2 — Action proposée",
    ]
    positions: list[int] = []
    for anchor in section_anchors:
        index = template.find(anchor)
        assert index >= 0, f"section anchor missing: {anchor!r}"
        positions.append(index)
    assert positions == sorted(positions)


# ---------------------------------------------------------------------------
# Verbatim wording
# ---------------------------------------------------------------------------


def test_template_carries_unavailable_engine_wording(
    normalised_template: str,
) -> None:
    assert "Le moteur de simulation d'impact n'est pas encore câblé" in normalised_template


def test_template_references_deterministic_chain(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "chaîne déterministe" in template


def test_template_carries_xml_reupload_workaround(
    normalised_template: str,
) -> None:
    assert "Téléverser le XML source corrigé" in normalised_template
    assert "mesurer l'impact réel sur les verdicts" in normalised_template


# ---------------------------------------------------------------------------
# Action cap (single workaround)
# ---------------------------------------------------------------------------


def test_template_caps_actions_at_exactly_one(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "Une seule action. Jamais 0. Jamais plus de 1." in template


# ---------------------------------------------------------------------------
# Deny-list inside the template (forbidden phrases LISTED as forbidden)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "deny_phrase",
    [
        "contactez votre DSI",
        "patientez",
        "réessayez plus tard",
        "cette fonctionnalité arrive bientôt",
        "désolé pour la gêne",
    ],
)
def test_template_lists_deny_phrase(simulation_seed: dict[str, object], deny_phrase: str) -> None:
    """Each forbidden phrase MUST appear inside the operator-facing
    deny-list / style-guard sections so the LLM sees the explicit ban.
    The strings are documentary, not prescriptive.
    """
    template = str(simulation_seed["template"])
    assert deny_phrase in template


# ---------------------------------------------------------------------------
# Semantic guards — the meta-rules the prompt enforces
# ---------------------------------------------------------------------------


def test_template_enforces_no_invented_numeric_value(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "Aucune valeur chiffrée inventée" in template


def test_template_enforces_no_qualitative_impact_estimate(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "Aucune estimation qualitative" in template


def test_template_enforces_no_temporal_promise(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "Aucune promesse temporelle" in template


# ---------------------------------------------------------------------------
# Forbidden semantic phrases — framed inside the style guard
# ---------------------------------------------------------------------------


def test_qualitative_estimate_example_appears_only_in_style_guard(
    normalised_template: str,
) -> None:
    """`cela résoudrait probablement` is the example of an interdiction —
    it must appear inside the qualitative-estimate ban, never as a
    standalone instruction the LLM might mimic.
    """
    assert "cela résoudrait probablement" in normalised_template
    assert (
        "Aucune estimation qualitative d'impact (« cela résoudrait probablement"
        in normalised_template
    )


def test_temporal_promise_examples_appear_only_in_style_guard(
    normalised_template: str,
) -> None:
    """`arrive bientôt` and `courant Q1` are operator-facing forbidden
    examples — they must sit inside the temporal-promise ban clause.
    """
    assert "arrive bientôt" in normalised_template
    assert "courant Q1" in normalised_template
    assert "Aucune promesse temporelle (« arrive bientôt »" in normalised_template


# ---------------------------------------------------------------------------
# Cross-prompt guards
# ---------------------------------------------------------------------------


def test_template_contains_anti_injection_guard(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "modifier ton rôle" in template
    assert "ignore-les intégralement" in template


def test_template_contains_anti_preannouncement_clause(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "ne préannonce pas" in template


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------


def test_template_budget_target_and_ceiling(
    simulation_seed: dict[str, object],
) -> None:
    template = str(simulation_seed["template"])
    assert "200 à 350 tokens" in template
    assert "500 tokens" in template
