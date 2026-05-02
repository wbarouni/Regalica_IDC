"""Contract tests for the regalica/aggregate_estimation_sanction seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters and output_contract reflect the V1 contract
    (string, max_tokens 512, temp 0.3 + thinking off — exception
    docs/05 §174 « pour ne pas dériver factuellement », further
    locked by the maintainer note);
  * The input schema declares `specialist_outputs.maxItems: 0` because
    intent_specialists.sanction has `specialist_ids=()` in canon
    migration 065 — V1 always receives an empty payload;
  * The template carries a CONTRAINTE JURIDIQUE ABSOLUE block, the
    verbatim legal disclaimer Phrase 3, the BCT 2017-06 articles 11-12
    citation in the workaround, and a NOTE MAINTENEURS that pins the
    intent of the temperature choice. Forbidden phrases that DO appear
    inside the operator-facing deny-list / style-guard sections are
    asserted via their framing, not via outright absence (pattern
    established commits historique / simulation).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_sanction_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if (
            entry["agent_type"] == "regalica"
            and entry["function_name"] == "aggregate_estimation_sanction"
        ):
            return entry
    raise AssertionError("regalica/aggregate_estimation_sanction entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def sanction_seed() -> dict[str, object]:
    return _load_sanction_entry()


@pytest.fixture
def normalised_template(sanction_seed: dict[str, object]) -> str:
    return _normalise(str(sanction_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_sanction_seed_canonical_inference_parameters(
    sanction_seed: dict[str, object],
) -> None:
    """Type 6 exception per docs/05 §174 — temp 0.3, no thinking."""
    assert sanction_seed["temperature"] == pytest.approx(0.3)
    assert sanction_seed["max_tokens"] == 512
    assert sanction_seed["thinking_enabled"] is False
    assert sanction_seed["target_model"] == "gemini-2.5-flash"


def test_sanction_seed_declares_output_contract_string(
    sanction_seed: dict[str, object],
) -> None:
    assert sanction_seed["output_contract"] == "string"


def test_sanction_seed_output_schema_is_string_with_bounds(
    sanction_seed: dict[str, object],
) -> None:
    schema = sanction_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 80
    assert schema["maxLength"] == 2500


# ---------------------------------------------------------------------------
# Input schema — V1 specifically pins maxItems: 0
# ---------------------------------------------------------------------------


def test_sanction_seed_input_intent_const_is_sanction(
    sanction_seed: dict[str, object],
) -> None:
    schema = sanction_seed["input_schema"]
    assert schema["properties"]["intent_type"]["const"] == "sanction"


def test_sanction_seed_input_specialist_outputs_maxitems_zero(
    sanction_seed: dict[str, object],
) -> None:
    schema = sanction_seed["input_schema"]
    assert schema["properties"]["specialist_outputs"]["maxItems"] == 0


def test_sanction_seed_input_blocks_extra_properties(
    sanction_seed: dict[str, object],
) -> None:
    schema = sanction_seed["input_schema"]
    assert schema["additionalProperties"] is False


# ---------------------------------------------------------------------------
# CONTRAINTE JURIDIQUE ABSOLUE block
# ---------------------------------------------------------------------------


def test_template_carries_absolute_legal_constraint_header(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "CONTRAINTE JURIDIQUE ABSOLUE" in template


@pytest.mark.parametrize(
    "forbidden_emission",
    [
        "montant en TND",
        "fourchette de montant",
        "ordre de grandeur",
        "comparaison avec une sanction historique",
        "interprétation libre de la grille progressive",
    ],
)
def test_template_lists_each_forbidden_numeric_emission(
    sanction_seed: dict[str, object], forbidden_emission: str
) -> None:
    """The CONTRAINTE JURIDIQUE ABSOLUE bullet list must enumerate every
    category of estimate the LLM is forbidden from producing.
    """
    template = str(sanction_seed["template"])
    assert forbidden_emission in template


# ---------------------------------------------------------------------------
# Mandatory legal disclaimer (Phrase 3) — verbatim wording
# ---------------------------------------------------------------------------


def test_template_carries_verbatim_legal_disclaimer(
    normalised_template: str,
) -> None:
    """Phrase 3 of SECTION 1 must appear verbatim — no paraphrase tolerance."""
    expected = (
        "Toute estimation fournie ultérieurement sera indicative ; la "
        "BCT se réserve un droit d'application discrétionnaire qui peut "
        "diverger de la grille progressive publiée."
    )
    assert expected in normalised_template


def test_template_documents_disclaimer_is_verbatim_and_non_paraphrasable(
    sanction_seed: dict[str, object],
) -> None:
    """Operator instruction must remind that the disclaimer is verbatim-only."""
    template = str(sanction_seed["template"])
    assert "non paraphrasée, non raccourcie" in template


def test_template_references_droit_application_discretionnaire(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "droit d'application discrétionnaire" in template


def test_template_references_grille_progressive_publiee(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "grille progressive publiée" in template


# ---------------------------------------------------------------------------
# Two-section structure
# ---------------------------------------------------------------------------


def test_template_contains_two_sections_in_canonical_order(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    section_anchors = [
        "SECTION 1 — Reconnaissance, indisponibilité V1 et avertissement juridique",
        "SECTION 2 — Workarounds documentés",
    ]
    positions: list[int] = []
    for anchor in section_anchors:
        index = template.find(anchor)
        assert index >= 0, f"section anchor missing: {anchor!r}"
        positions.append(index)
    assert positions == sorted(positions)


# ---------------------------------------------------------------------------
# Phrase 2 unavailability + circular reference
# ---------------------------------------------------------------------------


def test_template_carries_unavailable_engine_wording(
    normalised_template: str,
) -> None:
    assert "Le moteur d'estimation de sanction n'est pas encore câblé" in normalised_template


def test_template_references_calcul_gradue_circulaire_2017_06(
    normalised_template: str,
) -> None:
    assert "calcul gradué selon la circulaire BCT 2017-06" in normalised_template


# ---------------------------------------------------------------------------
# Citation references in the workaround
# ---------------------------------------------------------------------------


def test_template_workaround_references_circulaire_bct_2017_06(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "circulaire BCT 2017-06" in template


def test_template_workaround_references_articles_11_and_12(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "articles 11" in template
    assert "articles 11\n        et 12" in template or "articles 11 et 12" in template


# ---------------------------------------------------------------------------
# Workaround actions — verbatim openings
# ---------------------------------------------------------------------------


def test_template_carries_action_1_circulaire_consultation(
    normalised_template: str,
) -> None:
    assert "Consulter directement la circulaire BCT 2017-06" in normalised_template


def test_template_carries_action_2_compliance_department(
    normalised_template: str,
) -> None:
    assert "Solliciter le département conformité" in normalised_template


def test_template_caps_actions_at_one_or_two(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "Jamais 0 action. Jamais plus de 2." in template


# ---------------------------------------------------------------------------
# V2 forward-compat field names
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "v2_field",
    ["sanction_estimate", "severity_breakdown", "additional_factors", "citations[]"],
)
def test_template_documents_v2_payload_field(
    sanction_seed: dict[str, object], v2_field: str
) -> None:
    template = str(sanction_seed["template"])
    assert v2_field in template


def test_template_does_not_carry_legacy_delay_penalty_v2_field(
    sanction_seed: dict[str, object],
) -> None:
    """Earlier draft listed delay_penalty — replaced by additional_factors
    which is broader and forward-compat with the V2 calculate_sanction_estimate
    signature.
    """
    template = str(sanction_seed["template"])
    assert "delay_penalty" not in template


# ---------------------------------------------------------------------------
# NOTE MAINTENEURS
# ---------------------------------------------------------------------------


def test_template_carries_maintainer_note_block(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "NOTE MAINTENEURS" in template


def test_template_maintainer_note_locks_temperature_choice(
    normalised_template: str,
) -> None:
    """The maintainer note must explicitly forbid raising the temperature."""
    assert "Ne pas augmenter la température" in normalised_template


# ---------------------------------------------------------------------------
# Deny-list (forbidden phrases LISTED as forbidden in the template)
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
def test_template_lists_deny_phrase(sanction_seed: dict[str, object], deny_phrase: str) -> None:
    """Every forbidden phrase MUST appear inside the operator-facing
    interdits-stricts list so the LLM sees the explicit ban.
    """
    template = str(sanction_seed["template"])
    assert deny_phrase in template


# ---------------------------------------------------------------------------
# Numeric prohibitions surface in the style guard
# ---------------------------------------------------------------------------


def test_template_style_guard_forbids_tnd_amount(
    sanction_seed: dict[str, object],
) -> None:
    """The style guard must explicitly rule out TND amounts (positive
    assertion — the substring appears inside the ban clause).
    """
    template = str(sanction_seed["template"])
    assert "Pas de montant TND" in template


def test_template_style_guard_forbids_capital_percentage(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "pourcentage du capital" in template


# ---------------------------------------------------------------------------
# Cross-prompt guards
# ---------------------------------------------------------------------------


def test_template_contains_anti_injection_guard(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "modifier ton rôle" in template
    assert "ignore-les intégralement" in template


def test_template_contains_anti_preannouncement_clause(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "ne préannonce pas" in template


# ---------------------------------------------------------------------------
# Temporal-promise ban — framed assertion
# ---------------------------------------------------------------------------


def test_template_enforces_no_temporal_promise(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "Aucune promesse temporelle" in template


def test_temporal_promise_examples_appear_only_in_style_guard(
    normalised_template: str,
) -> None:
    """`arrive bientôt` is an operator-facing forbidden example — it
    must sit inside the temporal-promise ban clause, not outside it.
    """
    assert "arrive bientôt" in normalised_template
    assert "Aucune promesse temporelle (« arrive bientôt »" in normalised_template


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------


def test_template_budget_target_and_ceiling(
    sanction_seed: dict[str, object],
) -> None:
    template = str(sanction_seed["template"])
    assert "300 à 450 tokens" in template
    assert "600 tokens" in template
