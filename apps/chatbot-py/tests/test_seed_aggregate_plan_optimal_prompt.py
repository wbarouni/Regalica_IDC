"""Contract tests for the regalica/aggregate_plan_optimal seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters and output_contract reflect the V1 contract
    (string, max_tokens 2048, temp 0.7, thinking on);
  * The input schema accepts TWO bearers (investigator + historical) —
    different from simulation/sanction which had maxItems: 0, and
    from zoom/grappe/historique/citation which had a single bearer.
    Migration 065 lists specialist_ids=("investigator", "historical")
    for the plan intent;
  * The template carries the 3-section degraded-plan structure with:
    - Section 1 mention V1 verbatim about ranking module not active,
    - investigator-failure verbatim fallback,
    - Section 2 cap at 5 rubriques + overflow line,
    - Section 3 limited to navigation actions (no direct SI prescription),
    - V2 forward-compat field references.

Pattern established commits historique / simulation / sanction —
forbidden phrases that DO appear inside operator-facing deny-list /
style-guard sections are asserted via their framing, not via outright
absence.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_plan_optimal_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "regalica" and entry["function_name"] == "aggregate_plan_optimal":
            return entry
    raise AssertionError("regalica/aggregate_plan_optimal entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def plan_seed() -> dict[str, object]:
    return _load_plan_optimal_entry()


@pytest.fixture
def normalised_template(plan_seed: dict[str, object]) -> str:
    return _normalise(str(plan_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_plan_seed_canonical_inference_parameters(
    plan_seed: dict[str, object],
) -> None:
    """Type 7 canon docs/05 §7 ligne 169 — temp 0.7, thinking on."""
    assert plan_seed["temperature"] == pytest.approx(0.7)
    assert plan_seed["max_tokens"] == 2048
    assert plan_seed["thinking_enabled"] is True
    assert plan_seed["target_model"] == "gemini-2.5-flash"


def test_plan_seed_declares_output_contract_string(
    plan_seed: dict[str, object],
) -> None:
    assert plan_seed["output_contract"] == "string"


def test_plan_seed_output_schema_is_string_with_bounds(
    plan_seed: dict[str, object],
) -> None:
    schema = plan_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 100
    assert schema["maxLength"] == 6000


# ---------------------------------------------------------------------------
# Input schema — TWO bearers wired (investigator + historical)
# ---------------------------------------------------------------------------


def test_plan_seed_input_intent_const_is_plan(
    plan_seed: dict[str, object],
) -> None:
    schema = plan_seed["input_schema"]
    assert schema["properties"]["intent_type"]["const"] == "plan"


def test_plan_seed_input_bearer_enum_lists_investigator_and_historical(
    plan_seed: dict[str, object],
) -> None:
    """Migration 065 sets specialist_ids=("investigator", "historical")
    for the plan intent. The schema enumerates exactly those two bearers.
    """
    schema = plan_seed["input_schema"]
    bearers = schema["properties"]["specialist_outputs"]["items"]["properties"]["bearer"]["enum"]
    assert set(bearers) == {
        "investigator/analyze_fail",
        "historical/compare_runs_history",
    }


def test_plan_seed_input_blocks_extra_properties_at_both_levels(
    plan_seed: dict[str, object],
) -> None:
    schema = plan_seed["input_schema"]
    assert schema["additionalProperties"] is False
    item_schema = schema["properties"]["specialist_outputs"]["items"]
    assert item_schema["additionalProperties"] is False


# ---------------------------------------------------------------------------
# Investigator V2 canonical field references (deferred alignment marker)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "field",
    ["explanation_fr", "probable_root_cause", "suggested_actions[]", "rubriques[]"],
)
def test_template_references_investigator_v2_canonical_field(
    plan_seed: dict[str, object], field: str
) -> None:
    template = str(plan_seed["template"])
    assert field in template


# ---------------------------------------------------------------------------
# Historical V1 real field references
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("field", ["tendance", "delta_fail_severe", "commentaire", "runs_compares"])
def test_template_references_historical_v1_real_field(
    plan_seed: dict[str, object], field: str
) -> None:
    template = str(plan_seed["template"])
    assert field in template


# ---------------------------------------------------------------------------
# V1 mention verbatim + investigator failure fallback verbatim
# ---------------------------------------------------------------------------


def test_template_carries_v1_ranking_disclaimer_verbatim(
    normalised_template: str,
) -> None:
    """SECTION 1 must end with the verbatim mention V1 explaining the
    ranking module is not active.
    """
    expected = (
        "La priorisation effort/impact et la séquence gantt relèvent "
        "du module de ranking, non actif en V1."
    )
    assert expected in normalised_template


def test_template_carries_investigator_failure_fallback_verbatim(
    normalised_template: str,
) -> None:
    expected = (
        "L'analyse causale du FAIL pivot n'a pas pu être consolidée ; "
        "un plan optimal détaillé n'est pas constructible sans cette "
        "analyse."
    )
    assert expected in normalised_template


# ---------------------------------------------------------------------------
# Three-section structure
# ---------------------------------------------------------------------------


def test_template_contains_three_sections_in_canonical_order(
    plan_seed: dict[str, object],
) -> None:
    template = str(plan_seed["template"])
    section_anchors = [
        "SECTION 1 — Synthèse",
        "SECTION 2 — Corrections identifiées",
        "SECTION 3 — Action suivante",
    ]
    positions: list[int] = []
    for anchor in section_anchors:
        index = template.find(anchor)
        assert index >= 0, f"section anchor missing: {anchor!r}"
        positions.append(index)
    assert positions == sorted(positions)


# ---------------------------------------------------------------------------
# SECTION 2 cap rules
# ---------------------------------------------------------------------------


def test_template_section_2_caps_at_five_rubriques(
    plan_seed: dict[str, object],
) -> None:
    template = str(plan_seed["template"])
    assert "Maximum 5 lignes de rubrique" in template


def test_template_section_2_overflow_uses_n_minus_5_phrasing(
    normalised_template: str,
) -> None:
    assert "Et N rubriques supplémentaires identifiées sur ce run." in normalised_template


def test_template_section_2_records_recurrence_when_deterioration(
    normalised_template: str,
) -> None:
    assert "Récurrence historique observée" in normalised_template


# ---------------------------------------------------------------------------
# SECTION 3 — navigation actions only
# ---------------------------------------------------------------------------


def test_template_section_3_action_1_verbatim_zoom_navigation(
    normalised_template: str,
) -> None:
    assert (
        "Approfondir un FAIL spécifique en cliquant dessus pour "
        "obtenir un diagnostic causal détaillé."
    ) in normalised_template


def test_template_section_3_action_2_verbatim_history_navigation(
    normalised_template: str,
) -> None:
    assert (
        "Consulter l'historique d'une rubrique pour confirmer la "
        "récurrence ou identifier un changement récent de pattern."
    ) in normalised_template


def test_template_section_3_caps_actions_at_one_or_two(
    plan_seed: dict[str, object],
) -> None:
    template = str(plan_seed["template"])
    assert "Jamais 0 action. Jamais plus de 2." in template


def test_template_section_3_forbids_direct_si_prescription(
    normalised_template: str,
) -> None:
    """SECTION 3 is navigation, not direct SI correction."""
    assert "SECTION 3 est une navigation analytique, pas une prescription" in normalised_template


# ---------------------------------------------------------------------------
# V2 forward-compat field references
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "v2_field",
    [
        "rank_corrections",
        "ranked_corrections[]",
        "effort_estimate",
        "fails_resolved_count",
        "gantt_sequence",
        "quick_wins[]",
    ],
)
def test_template_documents_v2_payload_field(plan_seed: dict[str, object], v2_field: str) -> None:
    template = str(plan_seed["template"])
    assert v2_field in template


def test_template_documents_visualizer_chain_in_doctrine_block(
    normalised_template: str,
) -> None:
    assert "VisualizerAgent (séquence gantt)" in normalised_template


# ---------------------------------------------------------------------------
# Numeric prohibitions surface in the style guard
# ---------------------------------------------------------------------------


def test_template_style_guard_forbids_effort_chiffre(
    normalised_template: str,
) -> None:
    """The style guard must explicitly rule out effort estimates,
    durations, jours-homme, FAILs résolus.
    """
    assert "Aucun chiffre d'effort" in normalised_template


def test_template_style_guard_forbids_jours_homme(
    plan_seed: dict[str, object],
) -> None:
    template = str(plan_seed["template"])
    assert "jours-homme" in template


def test_template_style_guard_forbids_fails_resolved_count(
    plan_seed: dict[str, object],
) -> None:
    template = str(plan_seed["template"])
    assert "FAILs résolus en cumul" in template


# ---------------------------------------------------------------------------
# Cross-prompt guards
# ---------------------------------------------------------------------------


def test_template_contains_anti_injection_guard(
    plan_seed: dict[str, object],
) -> None:
    template = str(plan_seed["template"])
    assert "modifier ton rôle" in template
    assert "ignore-les intégralement" in template


def test_template_contains_anti_preannouncement_clause(
    plan_seed: dict[str, object],
) -> None:
    template = str(plan_seed["template"])
    assert "ne préannonce pas" in template


# ---------------------------------------------------------------------------
# Deny-list (forbidden phrases listed as forbidden in the template)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "deny_phrase",
    [
        "contactez votre DSI",
        "patientez",
        "réessayez plus tard",
        "cette fonctionnalité arrive bientôt",
    ],
)
def test_template_lists_deny_phrase(plan_seed: dict[str, object], deny_phrase: str) -> None:
    template = str(plan_seed["template"])
    assert deny_phrase in template


# ---------------------------------------------------------------------------
# Temporal-promise framed assertion
# ---------------------------------------------------------------------------


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
# Budget
# ---------------------------------------------------------------------------


def test_template_budget_target_and_ceiling(
    plan_seed: dict[str, object],
) -> None:
    template = str(plan_seed["template"])
    assert "500 à 900 tokens" in template
    assert "1500 tokens" in template
