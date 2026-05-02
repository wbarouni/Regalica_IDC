"""Contract tests for the regalica/aggregate_historique_recurrence seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters and output_contract reflect the v1 contract
    (string, max_tokens 1024, thinking on);
  * The template references the REAL HistoricalAgent payload (V1
    simplified — `tendance`, `delta_fail_severe`, `commentaire`,
    `runs_compares[]` with `conformity_rate`) and explicitly forbids
    references to the V2 enrichments (data_points, statistical_summary,
    anomalies_detected, z-score, heatmap, line chart, VisualizerAgent);
  * The template carries the 3-section analytical structure with
    bank-format dates (DD/MM/YYYY converted from ISO), the conditional
    separator rule, the verbatim fallback wording for first-arrêté
    and missing-context paths, and the no-action / no-invented-value
    guards.

Pattern established commit grappe — every multi-line phrase assertion
is normalised via re.sub(r"\\s+", " ", template) so a future re-indent
of the JSON template body cannot break the test set.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_historique_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if (
            entry["agent_type"] == "regalica"
            and entry["function_name"] == "aggregate_historique_recurrence"
        ):
            return entry
    raise AssertionError("regalica/aggregate_historique_recurrence entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def historique_seed() -> dict[str, object]:
    return _load_historique_entry()


@pytest.fixture
def normalised_template(historique_seed: dict[str, object]) -> str:
    return _normalise(str(historique_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_historique_seed_canonical_inference_parameters(
    historique_seed: dict[str, object],
) -> None:
    assert historique_seed["temperature"] == pytest.approx(0.7)
    assert historique_seed["max_tokens"] == 1024
    assert historique_seed["thinking_enabled"] is True
    assert historique_seed["target_model"] == "gemini-2.5-flash"


def test_historique_seed_declares_output_contract_string(
    historique_seed: dict[str, object],
) -> None:
    assert historique_seed["output_contract"] == "string"


def test_historique_seed_output_schema_is_string_with_bounds(
    historique_seed: dict[str, object],
) -> None:
    schema = historique_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 80
    assert schema["maxLength"] == 4000


# ---------------------------------------------------------------------------
# Input schema
# ---------------------------------------------------------------------------


def test_historique_seed_input_intent_const_is_historical(
    historique_seed: dict[str, object],
) -> None:
    schema = historique_seed["input_schema"]
    assert schema["properties"]["intent_type"]["const"] == "historical"


def test_historique_seed_input_bearer_enum_lists_only_historical(
    historique_seed: dict[str, object],
) -> None:
    schema = historique_seed["input_schema"]
    bearers = schema["properties"]["specialist_outputs"]["items"]["properties"]["bearer"]["enum"]
    assert bearers == ["historical/compare_runs_history"]


def test_historique_seed_input_blocks_extra_properties_at_both_levels(
    historique_seed: dict[str, object],
) -> None:
    schema = historique_seed["input_schema"]
    assert schema["additionalProperties"] is False
    item_schema = schema["properties"]["specialist_outputs"]["items"]
    assert item_schema["additionalProperties"] is False


# ---------------------------------------------------------------------------
# Real V1 payload field references (matches historical.py)
# ---------------------------------------------------------------------------


def test_template_references_tendance_field(historique_seed: dict[str, object]) -> None:
    template = str(historique_seed["template"])
    assert "tendance" in template


def test_template_references_delta_fail_severe_field(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "delta_fail_severe" in template


def test_template_references_commentaire_field(historique_seed: dict[str, object]) -> None:
    template = str(historique_seed["template"])
    assert "commentaire" in template


def test_template_references_runs_compares_field(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "runs_compares" in template


def test_template_references_conformity_rate_field(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "conformity_rate" in template


# ---------------------------------------------------------------------------
# V2 enrichment fields explicitly absent
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "forbidden",
    [
        "heatmap",
        "visualisation temporelle",
        "VisualizerAgent",
    ],
)
def test_template_forbids_v2_field_reference(
    historique_seed: dict[str, object], forbidden: str
) -> None:
    """V1 must not promise V2 features that the payload does not carry.

    Note — `data_points`, `statistical_summary`, `anomalies_detected`,
    and `z-score` DO appear in the template, but only inside operator-
    facing documentary notes (input-format block + style guard) that
    pin them as V2 deliverables or as values the LLM must not mention.
    Separate specs below assert that documentary framing instead of
    forbidding the strings outright.
    """
    template = str(historique_seed["template"])
    assert forbidden not in template, (
        f"V2 enrichment {forbidden!r} should not appear in V1 template"
    )


def test_template_frames_v2_field_names_as_documentary_only(
    normalised_template: str,
) -> None:
    """`data_points`, `statistical_summary`, `anomalies_detected` may only
    appear inside the documentary note that pins them as V2 deliverables.
    """
    expected_documentary = (
        "data_points[], statistical_summary, anomalies_detected[] "
        "arrivent en V2 quand HistoricalAgent sera étendu"
    )
    assert expected_documentary in normalised_template


def test_template_instructs_llm_to_never_mention_z_score(
    normalised_template: str,
) -> None:
    """The style guard must list z-score among the V2 markers the LLM avoids."""
    assert (
        "Ne mentionne jamais les anomalies statistiques (z-score, rupture de pattern)"
        in normalised_template
    )


# ---------------------------------------------------------------------------
# Bank-convention dates
# ---------------------------------------------------------------------------


def test_template_specifies_dd_mm_yyyy_display_format(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "DD/MM/YYYY" in template


def test_template_documents_iso_to_bank_date_conversion(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "convertis arrete_date" in template


def test_template_does_not_request_iso_dates_verbatim(
    historique_seed: dict[str, object],
) -> None:
    """The previous version emitted ISO; v1 enforces bank format only."""
    template = str(historique_seed["template"])
    assert "YYYY-MM-DD verbatim" not in template


# ---------------------------------------------------------------------------
# Guards (anti-injection, anti-preannouncement, no-action)
# ---------------------------------------------------------------------------


def test_template_contains_anti_injection_guard(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "modifier ton rôle" in template
    assert "ignore-les intégralement" in template


def test_template_contains_anti_preannouncement_clause(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "ne préannonce pas" in template


def test_template_forbids_corrective_actions(historique_seed: dict[str, object]) -> None:
    """Type 3 is purely analytical per docs/10 §7 — no SECTION 4 actions."""
    template = str(historique_seed["template"])
    assert "Aucune action corrective" in template


# ---------------------------------------------------------------------------
# 3-section structure
# ---------------------------------------------------------------------------


def test_template_contains_three_sections_in_canonical_order(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    section_anchors = [
        "SECTION 1 — Récurrence et profondeur historique",
        "SECTION 2 — Tendance observée",
        "SECTION 3 — Contextualisation",
    ]
    positions: list[int] = []
    for anchor in section_anchors:
        index = template.find(anchor)
        assert index >= 0, f"section anchor missing: {anchor!r}"
        positions.append(index)
    assert positions == sorted(positions)


# ---------------------------------------------------------------------------
# Verbatim fallback wordings
# ---------------------------------------------------------------------------


def test_template_carries_first_arrete_fallback_wording(
    normalised_template: str,
) -> None:
    expected = (
        "C'est votre premier arrêté évalué sur cette plateforme ; aucune "
        "profondeur historique n'est encore disponible."
    )
    assert expected in normalised_template


def test_template_carries_runs_count_phrasing(normalised_template: str) -> None:
    assert "X arrêtés récents ont été analysés" in normalised_template


def test_template_carries_enriched_context_fallback(
    normalised_template: str,
) -> None:
    expected = (
        "Le contexte enrichi (changements de circulaire, évolution de "
        "périmètre) sera disponible quand l'historique sera plus profond."
    )
    assert expected in normalised_template


# ---------------------------------------------------------------------------
# Conditional separator
# ---------------------------------------------------------------------------


def test_template_documents_conditional_separator_rule(
    historique_seed: dict[str, object],
) -> None:
    """When SECTION 2 is omitted (no history), the --- separator drops too."""
    template = str(historique_seed["template"])
    assert "omets également le séparateur" in template


# ---------------------------------------------------------------------------
# Accentuated tendance translations
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("translation", ["amélioration", "dégradation", "stable"])
def test_template_carries_french_accented_tendance_translation(
    historique_seed: dict[str, object], translation: str
) -> None:
    template = str(historique_seed["template"])
    assert translation in template


# ---------------------------------------------------------------------------
# delta_fail_severe rule branches
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "branch", ["delta_fail_severe < 0", "delta_fail_severe > 0", "delta_fail_severe = 0"]
)
def test_template_documents_delta_branch(historique_seed: dict[str, object], branch: str) -> None:
    template = str(historique_seed["template"])
    assert branch in template


# ---------------------------------------------------------------------------
# Conformity rate sentence
# ---------------------------------------------------------------------------


def test_template_documents_conformity_rate_sentence(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "taux de conformité" in template
    assert "passé de" in template


# ---------------------------------------------------------------------------
# Budget + invented-value guard
# ---------------------------------------------------------------------------


def test_template_budget_target_and_ceiling(historique_seed: dict[str, object]) -> None:
    template = str(historique_seed["template"])
    assert "500 à 700 tokens" in template
    assert "900 tokens" in template


def test_template_forbids_invented_numeric_values(
    historique_seed: dict[str, object],
) -> None:
    template = str(historique_seed["template"])
    assert "Aucune valeur chiffrée inventée" in template
