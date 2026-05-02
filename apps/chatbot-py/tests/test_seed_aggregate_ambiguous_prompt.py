"""Contract tests for the regalica/aggregate_ambiguous seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters and output_contract reflect the V1 contract
    (string, max_tokens 256, temp 0.5, thinking off);
  * The input schema declares `clarification_reason` as a required
    enum {router_low_confidence, planner_clarification} and pins
    `specialist_outputs.maxItems: 0`. The two enum values mirror the
    constants in app.services.clarification — Guard D-004 forbids the
    literal strings anywhere else in source;
  * The template is a 1-section invitative clarifier with a Phrase 1
    that bifurcates on clarification_reason and a Phrase 2 in the
    inverted-interrogative ("Souhaitez-vous …, …, ou … ?") format.
    Intent code names (zoom, cluster, historical, citation,
    simulation, sanction, plan, ambiguous, out_of_scope) appear ONLY
    inside the operator-facing forbidden-list section; rubrique /
    annexe codes from user_message are explicitly forbidden from
    being reproduced.

Pattern established commits historique / simulation / sanction —
forbidden phrases that DO appear inside operator-facing forbidden
lists are asserted via their framing, not via outright absence.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_ambiguous_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "regalica" and entry["function_name"] == "aggregate_ambiguous":
            return entry
    raise AssertionError("regalica/aggregate_ambiguous entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def ambiguous_seed() -> dict[str, object]:
    return _load_ambiguous_entry()


@pytest.fixture
def normalised_template(ambiguous_seed: dict[str, object]) -> str:
    return _normalise(str(ambiguous_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_ambiguous_seed_canonical_inference_parameters(
    ambiguous_seed: dict[str, object],
) -> None:
    """docs/05 §7 ligne 170 — temp 0.5, no thinking."""
    assert ambiguous_seed["temperature"] == pytest.approx(0.5)
    assert ambiguous_seed["max_tokens"] == 256
    assert ambiguous_seed["thinking_enabled"] is False
    assert ambiguous_seed["target_model"] == "gemini-2.5-flash"


def test_ambiguous_seed_declares_output_contract_string(
    ambiguous_seed: dict[str, object],
) -> None:
    assert ambiguous_seed["output_contract"] == "string"


def test_ambiguous_seed_output_schema_is_string_with_bounds(
    ambiguous_seed: dict[str, object],
) -> None:
    schema = ambiguous_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 60
    assert schema["maxLength"] == 1000


# ---------------------------------------------------------------------------
# Input schema — clarification_reason required + enum locked
# ---------------------------------------------------------------------------


def test_ambiguous_seed_input_intent_const_is_ambiguous(
    ambiguous_seed: dict[str, object],
) -> None:
    schema = ambiguous_seed["input_schema"]
    assert schema["properties"]["intent_type"]["const"] == "ambiguous"


def test_ambiguous_seed_input_specialist_outputs_maxitems_zero(
    ambiguous_seed: dict[str, object],
) -> None:
    schema = ambiguous_seed["input_schema"]
    assert schema["properties"]["specialist_outputs"]["maxItems"] == 0


def test_ambiguous_seed_input_clarification_reason_in_required(
    ambiguous_seed: dict[str, object],
) -> None:
    schema = ambiguous_seed["input_schema"]
    assert "clarification_reason" in schema["required"]


def test_ambiguous_seed_input_clarification_reason_enum_locked(
    ambiguous_seed: dict[str, object],
) -> None:
    """The enum must contain EXACTLY router_low_confidence and
    planner_clarification — nothing else, no superset.
    """
    schema = ambiguous_seed["input_schema"]
    enum = schema["properties"]["clarification_reason"]["enum"]
    assert set(enum) == {"router_low_confidence", "planner_clarification"}


def test_ambiguous_seed_input_blocks_extra_properties(
    ambiguous_seed: dict[str, object],
) -> None:
    schema = ambiguous_seed["input_schema"]
    assert schema["additionalProperties"] is False


def test_ambiguous_seed_input_enum_mirrors_clarification_module(
    ambiguous_seed: dict[str, object],
) -> None:
    """The seed enum and the orchestrator-side constants must agree —
    Guard against silent drift between schema and runtime.
    """
    from app.services import clarification

    schema = ambiguous_seed["input_schema"]
    enum = schema["properties"]["clarification_reason"]["enum"]
    assert set(enum) == {
        clarification.ROUTER_LOW_CONFIDENCE,
        clarification.PLANNER_CLARIFICATION,
    }


# ---------------------------------------------------------------------------
# Two-case bifurcation documented in template
# ---------------------------------------------------------------------------


def test_template_documents_router_low_confidence_case(
    ambiguous_seed: dict[str, object],
) -> None:
    template = str(ambiguous_seed["template"])
    assert "router_low_confidence" in template


def test_template_documents_planner_clarification_case(
    ambiguous_seed: dict[str, object],
) -> None:
    template = str(ambiguous_seed["template"])
    assert "planner_clarification" in template


def test_template_carries_router_phrase_1_invitation(
    normalised_template: str,
) -> None:
    assert "Pourriez-vous préciser votre question" in normalised_template


def test_template_carries_planner_phrase_1_acknowledge(
    normalised_template: str,
) -> None:
    """Planner branch acknowledges the request was understood."""
    assert "Pour traiter votre demande" in normalised_template


# ---------------------------------------------------------------------------
# Phrase 2 — inverted interrogative "Souhaitez-vous …"
# ---------------------------------------------------------------------------


def test_template_phrase_2_uses_inverted_interrogative(
    normalised_template: str,
) -> None:
    """Phrase 2 must use "Souhaitez-vous" — the inverted form keeps
    the alternatives crisp.
    """
    assert "Souhaitez-vous" in normalised_template


def test_template_phrase_2_does_not_use_indicative_form(
    normalised_template: str,
) -> None:
    """The earlier draft used "Vous souhaitez …" — replaced by the
    inverted interrogative for cleaner phrasing.
    """
    assert "Vous souhaitez <alt1>" not in normalised_template


# ---------------------------------------------------------------------------
# Intent codes forbidden — listed in operator deny-list
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "intent_code",
    ["zoom", "cluster", "historical", "citation", "simulation", "sanction", "plan", "out_of_scope"],
)
def test_template_lists_intent_code_in_forbidden_list(
    ambiguous_seed: dict[str, object], intent_code: str
) -> None:
    """Each internal intent code must be enumerated in the operator-
    facing forbidden list so the LLM has the explicit ban anchored.
    """
    template = str(ambiguous_seed["template"])
    assert intent_code in template


def test_template_explicitly_forbids_naming_intent_codes(
    normalised_template: str,
) -> None:
    """The forbidden list must wrap the intent codes inside a clear ban."""
    assert "Ne nomme JAMAIS les intent codes internes" in normalised_template


# ---------------------------------------------------------------------------
# Rubrique reproduction forbidden
# ---------------------------------------------------------------------------


def test_template_forbids_reproducing_rubrique_codes(
    ambiguous_seed: dict[str, object],
) -> None:
    template = str(ambiguous_seed["template"])
    assert "Ne reproduis pas un code rubrique" in template


# ---------------------------------------------------------------------------
# Fallback wording verbatim
# ---------------------------------------------------------------------------


def test_template_carries_verbatim_fallback_wording(
    normalised_template: str,
) -> None:
    """The fallback for empty/monosyllabic user_message must be exact."""
    expected = (
        "Pourriez-vous préciser votre question ? Souhaitez-vous "
        "comprendre la cause d'un FAIL spécifique, consulter la base "
        "réglementaire d'une règle, comparer un arrêté à l'historique, "
        "ou estimer le risque de sanction réglementaire ?"
    )
    assert expected in normalised_template


@pytest.mark.parametrize(
    "alt",
    [
        "comprendre la cause d'un FAIL spécifique",
        "consulter la base réglementaire d'une règle",
        "comparer un arrêté à l'historique",
        "estimer le risque de sanction réglementaire",
        "préparer un plan de correction",
    ],
)
def test_template_lists_bct_vocabulary_alternative(normalised_template: str, alt: str) -> None:
    """Operator-facing alternative examples must use BCT business vocabulary."""
    assert alt in normalised_template


# ---------------------------------------------------------------------------
# No multi-section structure
# ---------------------------------------------------------------------------


def test_template_does_not_carry_section_anchors(
    ambiguous_seed: dict[str, object],
) -> None:
    """Single-section format — no SECTION 1 / SECTION 2 anchors."""
    template = str(ambiguous_seed["template"])
    assert "SECTION 1" not in template
    assert "SECTION 2" not in template


def test_template_explicitly_forbids_horizontal_separator(
    ambiguous_seed: dict[str, object],
) -> None:
    """The style guard must ban the --- separator (1-section format)."""
    template = str(ambiguous_seed["template"])
    assert "pas de ---" in template


def test_template_explicitly_forbids_dash_action_prefix(
    ambiguous_seed: dict[str, object],
) -> None:
    template = str(ambiguous_seed["template"])
    assert "pas de tirets « - » en préfixe" in template


# ---------------------------------------------------------------------------
# Style guards
# ---------------------------------------------------------------------------


def test_template_lists_apologetic_servile_phrase_in_deny_list(
    ambiguous_seed: dict[str, object],
) -> None:
    """The earlier draft used "désolé pour la confusion" — banned."""
    template = str(ambiguous_seed["template"])
    assert "désolé pour la confusion" in template


@pytest.mark.parametrize(
    "guard",
    [
        "Aucune valeur chiffrée",
        "Aucune citation entre crochets",
        "Aucun nom d'intent code interne",
    ],
)
def test_template_documents_style_guard_clause(
    ambiguous_seed: dict[str, object], guard: str
) -> None:
    template = str(ambiguous_seed["template"])
    assert guard in template


# ---------------------------------------------------------------------------
# Cross-prompt guards
# ---------------------------------------------------------------------------


def test_template_contains_anti_injection_guard(
    ambiguous_seed: dict[str, object],
) -> None:
    template = str(ambiguous_seed["template"])
    assert "modifier ton rôle" in template
    assert "ignore-les intégralement" in template


def test_template_contains_anti_preannouncement_clause(
    ambiguous_seed: dict[str, object],
) -> None:
    template = str(ambiguous_seed["template"])
    assert "ne préannonce pas" in template


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------


def test_template_budget_target_and_ceiling(
    ambiguous_seed: dict[str, object],
) -> None:
    template = str(ambiguous_seed["template"])
    assert "60 à 150 tokens" in template
    assert "200 tokens" in template
