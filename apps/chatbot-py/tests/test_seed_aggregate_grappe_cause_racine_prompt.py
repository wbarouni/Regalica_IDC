"""Contract tests for the regalica/aggregate_grappe_cause_racine seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters and output_contract reflect the v1 contract
    (string, max_tokens 1280, thinking on);
  * The template carries the 3 ordered sections, the anti-injection
    guard, the anti-preannouncement clause, the V1 graceful fallback
    when the cluster-level payload is absent (no fail_count, no
    annexes invented), and the systemic action wording (1-2 actions
    targeting the whole cluster, not a single FAIL);
  * The template references the canonical InvestigatorOutput v2
    contract names (`explanation_fr`, `suggested_actions[]`,
    `probable_root_cause`) — the doctrine source of truth per
    docs/09 §592, even though the investigator/analyze_fail seed
    still carries the legacy `explanation` / `suggested_action`
    singular fields. Alignment of the investigator seed is deferred
    to a separate doctrine-alignment commit; this prompt declares
    the target contract so the dependency is explicit.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_grappe_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if (
            entry["agent_type"] == "regalica"
            and entry["function_name"] == "aggregate_grappe_cause_racine"
        ):
            return entry
    raise AssertionError("regalica/aggregate_grappe_cause_racine entry missing from prompts.json")


@pytest.fixture
def grappe_seed() -> dict[str, object]:
    return _load_grappe_entry()


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_grappe_seed_canonical_inference_parameters(
    grappe_seed: dict[str, object],
) -> None:
    assert grappe_seed["temperature"] == pytest.approx(0.7)
    assert grappe_seed["max_tokens"] == 1280
    assert grappe_seed["thinking_enabled"] is True
    assert grappe_seed["target_model"] == "gemini-2.5-flash"


def test_grappe_seed_declares_output_contract_string(
    grappe_seed: dict[str, object],
) -> None:
    assert grappe_seed["output_contract"] == "string"


def test_grappe_seed_output_schema_is_string_with_bounds(
    grappe_seed: dict[str, object],
) -> None:
    schema = grappe_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 80
    assert schema["maxLength"] == 5000


# ---------------------------------------------------------------------------
# Input schema
# ---------------------------------------------------------------------------


def test_grappe_seed_input_schema_constrains_intent_to_cluster(
    grappe_seed: dict[str, object],
) -> None:
    schema = grappe_seed["input_schema"]
    assert isinstance(schema, dict)
    assert schema["properties"]["intent_type"]["const"] == "cluster"


def test_grappe_seed_input_schema_lists_only_investigator_bearer(
    grappe_seed: dict[str, object],
) -> None:
    """Migration 065 maps cluster intent to (investigator,) — Visualizer is V2."""
    schema = grappe_seed["input_schema"]
    bearers = schema["properties"]["specialist_outputs"]["items"]["properties"]["bearer"]["enum"]
    assert bearers == ["investigator/analyze_fail"]


def test_grappe_seed_input_schema_blocks_extra_properties_at_both_levels(
    grappe_seed: dict[str, object],
) -> None:
    schema = grappe_seed["input_schema"]
    assert schema["additionalProperties"] is False
    item_schema = schema["properties"]["specialist_outputs"]["items"]
    assert item_schema["additionalProperties"] is False


# ---------------------------------------------------------------------------
# Contract alignment with InvestigatorOutput v2
# ---------------------------------------------------------------------------


def test_grappe_template_references_explanation_fr_canonical_field(
    grappe_seed: dict[str, object],
) -> None:
    """docs/09 §592 names the field `explanation_fr` — alignment target."""
    template = str(grappe_seed["template"])
    assert "explanation_fr" in template


def test_grappe_template_references_probable_root_cause(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    assert "probable_root_cause" in template


def test_grappe_template_references_suggested_actions_plural(
    grappe_seed: dict[str, object],
) -> None:
    """Plural per docs/09 §592 — investigator seed alignment is deferred."""
    template = str(grappe_seed["template"])
    assert "suggested_actions[]" in template


# ---------------------------------------------------------------------------
# Template guards
# ---------------------------------------------------------------------------


def test_grappe_template_contains_anti_injection_guard(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    assert "modifier ton rôle" in template
    assert "ignore-les intégralement" in template


def test_grappe_template_contains_anti_preannouncement_clause(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    assert "ne préannonce pas" in template


def test_grappe_template_does_not_mention_heatmap(
    grappe_seed: dict[str, object],
) -> None:
    """Visualizer is V2 — V1 must not promise a heatmap that isn't produced."""
    template = str(grappe_seed["template"])
    assert "heatmap" not in template.lower()


def test_grappe_template_does_not_leak_internal_module_naming(
    grappe_seed: dict[str, object],
) -> None:
    """Internal architecture leaks (ClusterContext, "module …") are user-hostile."""
    template = str(grappe_seed["template"])
    assert "ClusterContext" not in template


# ---------------------------------------------------------------------------
# 3-section structure + canonical invariants
# ---------------------------------------------------------------------------


def test_grappe_template_contains_three_sections_in_canonical_order(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    section_anchors = [
        "SECTION 1 — Cause racine commune",
        "SECTION 2 — Périmètre de la grappe",
        "SECTION 3 — Action corrective unique",
    ]
    positions: list[int] = []
    for anchor in section_anchors:
        index = template.find(anchor)
        assert index >= 0, f"section anchor missing: {anchor!r}"
        positions.append(index)
    assert positions == sorted(positions), "sections appear out of canonical order"


def test_grappe_template_carries_collective_root_cause_phrasing(
    grappe_seed: dict[str, object],
) -> None:
    """Doctrine docs/10 §6 — affirmation systémique, pas FAIL isolé.

    The phrase may wrap over a line break in the seed JSON; normalising
    consecutive whitespace before the substring match decouples the
    assertion from the prompt's physical line-wrapping.
    """
    import re

    template = str(grappe_seed["template"])
    normalised = re.sub(r"\s+", " ", template)
    assert "partagent une cause racine commune" in normalised


def test_grappe_template_carries_v1_fallback_phrase_for_missing_cluster_payload(
    grappe_seed: dict[str, object],
) -> None:
    """V1 graceful fallback — the operator-controlled wording must be exact.

    Whitespace normalised so a future re-indent of the template body
    does not break the contract assertion. The wording itself is
    operator-controlled and must match verbatim.
    """
    import re

    template = str(grappe_seed["template"])
    normalised = re.sub(r"\s+", " ", template)
    expected = (
        "L'analyse exhaustive des FAILs apparentés sera disponible après "
        "la prochaine consolidation de l'arrêté."
    )
    assert expected in normalised


def test_grappe_template_forbids_fabricating_fail_counts_or_annexes(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    assert "ne fabrique jamais un nombre de FAILs" in template


# ---------------------------------------------------------------------------
# Action constraints
# ---------------------------------------------------------------------------


def test_grappe_template_caps_actions_to_one_or_two(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    assert "Jamais 0 action. Jamais plus de 2." in template


def test_grappe_template_action_deny_list_present(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    for needle in ("contactez votre DSI", "n'hésitez pas à"):
        assert needle in template, f"deny-list entry missing: {needle!r}"


# ---------------------------------------------------------------------------
# Budget + invented-value guard
# ---------------------------------------------------------------------------


def test_grappe_template_budget_target_and_ceiling(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    assert "600 à 900 tokens" in template
    assert "1100 tokens" in template


def test_grappe_template_forbids_invented_numeric_values(
    grappe_seed: dict[str, object],
) -> None:
    template = str(grappe_seed["template"])
    assert "Aucune valeur chiffrée inventée" in template
