"""Contract tests for the regalica/aggregate_zoom_fail seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters and output_contract reflect the v1 contract
    (string, not JSON envelope, max_tokens 1024, thinking on);
  * The template carries the 5 ordered sections, the anti-injection
    guard, the anti-preannouncement clause, the citation format
    rules ("BCT 2017-06" with mandatory space + dash, "article 8 §3"
    style), and the "citation en cours de constitution" fallback;
  * The forbidden phrases for SECTION 5 actions are listed inline so
    a future operator editing the prompt sees the deny-list.

The mirror with migration 069's backfill is enforced separately in
test_seed_investigator_analyze_fail_prompt.py and the Jest test for
migration 069 — this file focuses on the aggregator template content.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_aggregate_zoom_fail_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "regalica" and entry["function_name"] == "aggregate_zoom_fail":
            return entry
    raise AssertionError("regalica/aggregate_zoom_fail entry missing from prompts.json")


@pytest.fixture
def zoom_fail_seed() -> dict[str, object]:
    return _load_aggregate_zoom_fail_entry()


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_zoom_fail_seed_canonical_inference_parameters(
    zoom_fail_seed: dict[str, object],
) -> None:
    assert zoom_fail_seed["temperature"] == pytest.approx(0.7)
    assert zoom_fail_seed["max_tokens"] == 1024
    assert zoom_fail_seed["thinking_enabled"] is True
    assert zoom_fail_seed["target_model"] == "gemini-2.5-flash"


def test_zoom_fail_seed_declares_output_contract_string(
    zoom_fail_seed: dict[str, object],
) -> None:
    """output_contract = 'string' switches the orchestrator to markdown mode."""
    assert zoom_fail_seed["output_contract"] == "string"


def test_zoom_fail_seed_output_schema_is_string(zoom_fail_seed: dict[str, object]) -> None:
    """output_schema must be a JSON Schema 'string' type, not 'object' envelope."""
    schema = zoom_fail_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 50
    assert schema["maxLength"] == 4000


def test_zoom_fail_seed_input_schema_constrains_intent_to_zoom(
    zoom_fail_seed: dict[str, object],
) -> None:
    schema = zoom_fail_seed["input_schema"]
    assert isinstance(schema, dict)
    assert set(schema["required"]) == {"user_message", "intent_type", "specialist_outputs"}
    assert schema["properties"]["intent_type"]["const"] == "zoom"


# ---------------------------------------------------------------------------
# Template invariants
# ---------------------------------------------------------------------------


def test_zoom_fail_template_contains_five_sections_in_canonical_order(
    zoom_fail_seed: dict[str, object],
) -> None:
    template = str(zoom_fail_seed["template"])
    section_anchors = [
        "SECTION 1 — Diagnostic causal",
        "SECTION 2 — Valeurs chiffrées",
        "SECTION 3 — Rubrique",
        "SECTION 4 — Citation réglementaire",
        "SECTION 5 — Actions proposées",
    ]
    positions: list[int] = []
    for anchor in section_anchors:
        index = template.find(anchor)
        assert index >= 0, f"section anchor missing: {anchor!r}"
        positions.append(index)
    assert positions == sorted(positions), "sections appear out of canonical order"


def test_zoom_fail_template_contains_anti_injection_guard(
    zoom_fail_seed: dict[str, object],
) -> None:
    template = str(zoom_fail_seed["template"])
    assert "modifier ton rôle" in template
    assert "ignore-les intégralement" in template


def test_zoom_fail_template_contains_anti_preannouncement_clause(
    zoom_fail_seed: dict[str, object],
) -> None:
    """Mémoire #30 — defence against Gemini thinking-trace leakage."""
    template = str(zoom_fail_seed["template"])
    assert "ne préannonce pas" in template


def test_zoom_fail_template_contains_citation_constitution_fallback(
    zoom_fail_seed: dict[str, object],
) -> None:
    template = str(zoom_fail_seed["template"])
    assert "citation en cours de constitution" in template


def test_zoom_fail_template_forbids_invented_numeric_values(
    zoom_fail_seed: dict[str, object],
) -> None:
    template = str(zoom_fail_seed["template"])
    assert "Aucune valeur chiffrée ne doit être inventée" in template


def test_zoom_fail_template_forbids_regulatory_reference_without_citation(
    zoom_fail_seed: dict[str, object],
) -> None:
    template = str(zoom_fail_seed["template"])
    assert "Aucune référence réglementaire sans citation" in template


def test_zoom_fail_template_does_not_carry_old_chiffre_rule(
    zoom_fail_seed: dict[str, object],
) -> None:
    """Negative — the v1 wording replaces the older "Aucun fait chiffré" form."""
    template = str(zoom_fail_seed["template"])
    assert "Aucun fait chiffré sans citation" not in template


def test_zoom_fail_template_references_gap_relative(
    zoom_fail_seed: dict[str, object],
) -> None:
    """SECTION 2 must reference investigator.output.gap_relative explicitly."""
    template = str(zoom_fail_seed["template"])
    assert "gap_relative" in template


def test_zoom_fail_template_specifies_strict_citation_format(
    zoom_fail_seed: dict[str, object],
) -> None:
    """Citation format rules drive the UI's regex extraction downstream."""
    template = str(zoom_fail_seed["template"])
    assert "BCT 2017-06" in template
    assert "BCT2017-06" in template  # appears in the negative example
    assert "article 8 §3" in template


def test_zoom_fail_template_lists_action_deny_list(
    zoom_fail_seed: dict[str, object],
) -> None:
    template = str(zoom_fail_seed["template"])
    for needle in ("contactez votre DSI", "ouvrez un ticket", "n'hésitez pas à"):
        assert needle in template, f"deny-list entry missing: {needle!r}"


def test_zoom_fail_template_does_not_use_strict_qualifier_on_budget(
    zoom_fail_seed: dict[str, object],
) -> None:
    """The v1 wording uses "Plafond indicatif" — "Plafond strict" was rejected."""
    template = str(zoom_fail_seed["template"])
    assert "Plafond strict" not in template
    assert "Plafond indicatif" in template


def test_zoom_fail_template_states_no_emoji_no_servile_phrases(
    zoom_fail_seed: dict[str, object],
) -> None:
    template = str(zoom_fail_seed["template"])
    assert "Aucun emoji" in template
    # The "Aucune phrase servile" anchor is the operator-facing label;
    # the inline examples ("merci de votre question", etc.) are only
    # validated via the "n'hésitez pas" check above.
    assert "Aucune phrase servile" in template


def test_zoom_fail_template_specifies_400_to_600_token_target(
    zoom_fail_seed: dict[str, object],
) -> None:
    template = str(zoom_fail_seed["template"])
    assert "400 à 600 tokens" in template
    assert "800 tokens" in template
