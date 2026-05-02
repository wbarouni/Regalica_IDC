"""Contract tests for the visualizer/produce_chart seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (json contract,
    max_tokens 4096, temperature 0.3, thinking off, gemini-2.5-flash);
  * The input_schema accepts a structured validation_run block (same
    shape as reporter inputs, minus the numeric trio per verdict —
    the visualizer only reads statut/severity/probable_root_cause/
    rubriques) plus a 5-enum chart_type and a nullable caller-supplied
    title;
  * The output_schema produces an inline SVG envelope: chart_type
    echoed, title (str), svg_content (autonomous SVG, no <script>,
    no external resources), legend (label→hex map), and
    accessibility_description (≥20 chars, French, screen-reader
    target). The template enforces the REGFlow palette (9 hex values
    only), one of 5 chart specifications, and pre-emit SVG validity
    checks.

Pattern established commits historique / simulation / sanction /
ambiguous / out_of_scope / general_help / extract_rule_from_xlsx /
draft_rule_from_form / extract_referential_from_pdf /
investigator_analyze_fail / compare_runs_history / generate_docx /
generate_pdf — phrase assertions normalised via
re.sub(r"\\s+", " ", template).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_produce_chart_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "visualizer" and entry["function_name"] == "produce_chart":
            return entry
    raise AssertionError("visualizer/produce_chart entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def produce_chart_seed() -> dict[str, object]:
    return _load_produce_chart_entry()


@pytest.fixture
def normalised_template(produce_chart_seed: dict[str, object]) -> str:
    return _normalise(str(produce_chart_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_seed_canonical_inference_parameters(produce_chart_seed: dict[str, object]) -> None:
    assert produce_chart_seed["temperature"] == pytest.approx(0.3)
    assert produce_chart_seed["max_tokens"] == 4096
    assert produce_chart_seed["thinking_enabled"] is False
    assert produce_chart_seed["target_model"] == "gemini-2.5-flash"


def test_seed_declares_output_contract_json(produce_chart_seed: dict[str, object]) -> None:
    assert produce_chart_seed["output_contract"] == "json"


# ---------------------------------------------------------------------------
# input_schema — structured validation_run + 5-enum chart_type
# ---------------------------------------------------------------------------


def test_input_chart_type_enum_five_canonical_values(
    produce_chart_seed: dict[str, object],
) -> None:
    schema = produce_chart_seed["input_schema"]
    assert schema["properties"]["chart_type"]["enum"] == [
        "heatmap",
        "bar_chart",
        "gantt",
        "pie_chart",
        "line_chart",
    ]


def test_input_validation_run_required_carries_verdicts(
    produce_chart_seed: dict[str, object],
) -> None:
    schema = produce_chart_seed["input_schema"]
    vrun = schema["properties"]["validation_run"]
    assert "verdicts" in vrun["required"]


def test_input_verdicts_item_statut_enum(produce_chart_seed: dict[str, object]) -> None:
    schema = produce_chart_seed["input_schema"]
    items = schema["properties"]["validation_run"]["properties"]["verdicts"]["items"]
    assert items["properties"]["statut"]["enum"] == ["FAIL", "PASS"]


def test_input_verdicts_item_severity_enum_includes_null(
    produce_chart_seed: dict[str, object],
) -> None:
    schema = produce_chart_seed["input_schema"]
    items = schema["properties"]["validation_run"]["properties"]["verdicts"]["items"]
    assert None in items["properties"]["severity"]["enum"]


def test_input_schema_blocks_extra_properties_top_level(
    produce_chart_seed: dict[str, object],
) -> None:
    schema = produce_chart_seed["input_schema"]
    assert schema["additionalProperties"] is False


def test_input_schema_validation_run_blocks_extra_properties(
    produce_chart_seed: dict[str, object],
) -> None:
    schema = produce_chart_seed["input_schema"]
    vrun = schema["properties"]["validation_run"]
    assert vrun["additionalProperties"] is False


# ---------------------------------------------------------------------------
# output_schema — SVG envelope
# ---------------------------------------------------------------------------


def test_output_schema_required_fields(produce_chart_seed: dict[str, object]) -> None:
    schema = produce_chart_seed["output_schema"]
    assert set(schema["required"]) == {
        "chart_type",
        "title",
        "svg_content",
        "legend",
        "accessibility_description",
    }


def test_output_chart_type_enum_five_canonical_values(
    produce_chart_seed: dict[str, object],
) -> None:
    schema = produce_chart_seed["output_schema"]
    assert schema["properties"]["chart_type"]["enum"] == [
        "heatmap",
        "bar_chart",
        "gantt",
        "pie_chart",
        "line_chart",
    ]


def test_output_svg_content_is_string(produce_chart_seed: dict[str, object]) -> None:
    schema = produce_chart_seed["output_schema"]
    assert schema["properties"]["svg_content"]["type"] == "string"


def test_output_legend_additional_properties_are_strings(
    produce_chart_seed: dict[str, object],
) -> None:
    """Legend is a map label → hex colour string."""
    schema = produce_chart_seed["output_schema"]
    legend = schema["properties"]["legend"]
    assert legend["additionalProperties"]["type"] == "string"


def test_output_accessibility_description_min_length(
    produce_chart_seed: dict[str, object],
) -> None:
    schema = produce_chart_seed["output_schema"]
    assert schema["properties"]["accessibility_description"]["minLength"] == 20


# ---------------------------------------------------------------------------
# REGFlow palette — strict colour set
# ---------------------------------------------------------------------------


def test_template_carries_marigold_signature_hex(
    produce_chart_seed: dict[str, object],
) -> None:
    """#F0A500 is the brand signature colour."""
    template = str(produce_chart_seed["template"])
    assert "#F0A500" in template


def test_template_carries_vermillon_bloquant_hex(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "#C0392B" in template


def test_template_carries_vert_sobre_pass_hex(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "#27AE60" in template


def test_template_carries_palette_section_anchor(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "PALETTE DE COULEURS REGFlow" in template


def test_template_locks_palette_against_other_colours(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "NE JAMAIS utiliser d'autres couleurs" in template


# ---------------------------------------------------------------------------
# SVG universal constraints
# ---------------------------------------------------------------------------


def test_template_documents_viewbox_constraint(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "viewBox" in template


def test_template_documents_default_viewbox_dimensions(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "0 0 800 500" in template


def test_template_forbids_script_tags_in_svg(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "Pas de <script>" in template


def test_template_documents_accessible_svg_title(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "<title>" in template


def test_template_forbids_external_resources(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "ressources externes" in template


# ---------------------------------------------------------------------------
# 5 chart types documented
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "kind",
    ["heatmap", "bar_chart", "gantt", "pie_chart", "line_chart"],
)
def test_template_documents_each_chart_type(
    produce_chart_seed: dict[str, object], kind: str
) -> None:
    template = str(produce_chart_seed["template"])
    assert kind in template


# ---------------------------------------------------------------------------
# Heatmap-specific logic
# ---------------------------------------------------------------------------


def test_template_documents_heatmap_annexe_rubrique_axes(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    multiplication_sign = chr(0x00D7)
    needle = f"annexe {multiplication_sign} rubrique"
    assert needle in template


def test_template_documents_heatmap_high_count_threshold(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "≥ 4 FAILs" in template


def test_template_documents_heatmap_truncation_cap(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "10 rubriques" in template


# ---------------------------------------------------------------------------
# Line chart V1 single-point guard
# ---------------------------------------------------------------------------


def test_template_documents_line_chart_v1_single_point_guard(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "point unique en V1" in template


def test_template_documents_line_chart_v2_deferral_annotation(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "Données historiques disponibles en V2" in template


# ---------------------------------------------------------------------------
# Pre-emit SVG validity checks
# ---------------------------------------------------------------------------


def test_template_pre_emit_svg_open_tag_check(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "commence par <svg" in template


def test_template_pre_emit_svg_close_tag_check(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "se termine par </svg>" in template


# ---------------------------------------------------------------------------
# Accessibility surface
# ---------------------------------------------------------------------------


def test_template_documents_accessibility_field(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "accessibility_description" in template


def test_template_documents_screen_reader_target(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "non-voyant" in template


# ---------------------------------------------------------------------------
# Security guard
# ---------------------------------------------------------------------------


def test_template_carries_security_contract(produce_chart_seed: dict[str, object]) -> None:
    template = str(produce_chart_seed["template"])
    assert "CONTRAT DE SÉCURITÉ" in template


# ---------------------------------------------------------------------------
# Persona NOT-Regalica
# ---------------------------------------------------------------------------


def test_template_explicitly_not_regalica(produce_chart_seed: dict[str, object]) -> None:
    template = str(produce_chart_seed["template"])
    assert "Tu n'es PAS Regalica" in template


# ---------------------------------------------------------------------------
# Pre-emit mental validation
# ---------------------------------------------------------------------------


def test_template_carries_pre_emit_validation_clause(
    produce_chart_seed: dict[str, object],
) -> None:
    template = str(produce_chart_seed["template"])
    assert "Avant d'émettre le JSON, vérifie mentalement" in template
