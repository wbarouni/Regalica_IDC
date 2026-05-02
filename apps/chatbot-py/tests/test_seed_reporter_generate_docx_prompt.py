"""Contract tests for the reporter/generate_docx seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (json contract,
    max_tokens 8192, temperature 0.1, thinking off, gemini-2.5-flash);
  * The input_schema accepts a structured validation_run block carrying
    the totals (pass / fail / fail_severe / fail_rounding /
    conformity_rate) plus the verdicts[] array (statut FAIL/PASS,
    nullable severity 3-enum + null, nullable numeric trio,
    rubriques[]). report_type is one of three V1 deliverables:
    livrable_a (FAILs only), livrable_b (FAIL + PASS), livrable_c
    (root-cause clusters);
  * The output_schema produces the python-docx renderer envelope:
    report_type echoed, title, sections[] (minItems 1) where each
    section carries heading, level (1..3), markdown content, style
    (6-enum normal/summary/fail_critical/fail_major/pass/cluster),
    and an optional table_data 2D array.

Pattern established commits historique / simulation / sanction /
ambiguous / out_of_scope / general_help / extract_rule_from_xlsx /
draft_rule_from_form / extract_referential_from_pdf /
investigator_analyze_fail / compare_runs_history — phrase assertions
normalised via re.sub(r"\\s+", " ", template).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_generate_docx_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "reporter" and entry["function_name"] == "generate_docx":
            return entry
    raise AssertionError("reporter/generate_docx entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def generate_docx_seed() -> dict[str, object]:
    return _load_generate_docx_entry()


@pytest.fixture
def normalised_template(generate_docx_seed: dict[str, object]) -> str:
    return _normalise(str(generate_docx_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_seed_canonical_inference_parameters(generate_docx_seed: dict[str, object]) -> None:
    assert generate_docx_seed["temperature"] == pytest.approx(0.1)
    assert generate_docx_seed["max_tokens"] == 8192
    assert generate_docx_seed["thinking_enabled"] is False
    assert generate_docx_seed["target_model"] == "gemini-2.5-flash"


def test_seed_declares_output_contract_json(generate_docx_seed: dict[str, object]) -> None:
    assert generate_docx_seed["output_contract"] == "json"


# ---------------------------------------------------------------------------
# input_schema — structured validation_run block
# ---------------------------------------------------------------------------


def test_input_schema_top_level_required(generate_docx_seed: dict[str, object]) -> None:
    schema = generate_docx_seed["input_schema"]
    assert set(schema["required"]) == {
        "run_id",
        "tenant_id",
        "report_type",
        "validation_run",
    }


def test_input_schema_top_level_blocks_extra_properties(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["input_schema"]
    assert schema["additionalProperties"] is False


def test_input_report_type_enum_three_v1_deliverables(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["input_schema"]
    assert schema["properties"]["report_type"]["enum"] == [
        "livrable_a",
        "livrable_b",
        "livrable_c",
    ]


def test_input_validation_run_required_fields(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["input_schema"]
    vrun = schema["properties"]["validation_run"]
    assert set(vrun["required"]) == {
        "total_pass",
        "total_fail",
        "total_fail_severe",
        "total_fail_rounding",
        "conformity_rate",
        "verdicts",
    }


def test_input_validation_run_blocks_extra_properties(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["input_schema"]
    vrun = schema["properties"]["validation_run"]
    assert vrun["additionalProperties"] is False


def test_input_verdicts_item_statut_enum(generate_docx_seed: dict[str, object]) -> None:
    schema = generate_docx_seed["input_schema"]
    items = schema["properties"]["validation_run"]["properties"]["verdicts"]["items"]
    assert items["properties"]["statut"]["enum"] == ["FAIL", "PASS"]


def test_input_verdicts_item_severity_enum_includes_three_levels_and_null(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["input_schema"]
    items = schema["properties"]["validation_run"]["properties"]["verdicts"]["items"]
    severity_enum = items["properties"]["severity"]["enum"]
    for level in ("BLOQUANT", "MAJEUR", "MINEUR"):
        assert level in severity_enum
    assert None in severity_enum


def test_input_verdicts_item_blocks_extra_properties(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["input_schema"]
    items = schema["properties"]["validation_run"]["properties"]["verdicts"]["items"]
    assert items["additionalProperties"] is False


# ---------------------------------------------------------------------------
# output_schema — python-docx renderer envelope
# ---------------------------------------------------------------------------


def test_output_schema_required_fields(generate_docx_seed: dict[str, object]) -> None:
    schema = generate_docx_seed["output_schema"]
    assert set(schema["required"]) == {"report_type", "title", "sections"}


def test_output_report_type_enum_three_v1_deliverables(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["output_schema"]
    assert schema["properties"]["report_type"]["enum"] == [
        "livrable_a",
        "livrable_b",
        "livrable_c",
    ]


def test_output_sections_min_one(generate_docx_seed: dict[str, object]) -> None:
    schema = generate_docx_seed["output_schema"]
    assert schema["properties"]["sections"]["minItems"] == 1


def test_output_sections_item_style_enum_six_canonical_values(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["output_schema"]
    item = schema["properties"]["sections"]["items"]
    assert item["properties"]["style"]["enum"] == [
        "normal",
        "summary",
        "fail_critical",
        "fail_major",
        "pass",
        "cluster",
    ]


def test_output_sections_item_level_bounds(generate_docx_seed: dict[str, object]) -> None:
    schema = generate_docx_seed["output_schema"]
    item = schema["properties"]["sections"]["items"]
    assert item["properties"]["level"]["minimum"] == 1
    assert item["properties"]["level"]["maximum"] == 3


def test_output_sections_item_table_data_is_nullable(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["output_schema"]
    item = schema["properties"]["sections"]["items"]
    table_type = item["properties"]["table_data"]["type"]
    assert "null" in table_type
    assert "array" in table_type


def test_output_sections_item_blocks_extra_properties(
    generate_docx_seed: dict[str, object],
) -> None:
    schema = generate_docx_seed["output_schema"]
    item = schema["properties"]["sections"]["items"]
    assert item["additionalProperties"] is False


# ---------------------------------------------------------------------------
# 3 livrables documented in template
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "deliverable",
    ["livrable_a", "livrable_b", "livrable_c"],
)
def test_template_documents_each_livrable(
    generate_docx_seed: dict[str, object], deliverable: str
) -> None:
    template = str(generate_docx_seed["template"])
    assert deliverable in template


def test_template_carries_livrable_c_full_title(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "Livrable C — Causes racines et clusters" in template


# ---------------------------------------------------------------------------
# Synthèse section common to all 3 livrables
# ---------------------------------------------------------------------------


def test_template_documents_synthesis_heading(generate_docx_seed: dict[str, object]) -> None:
    template = str(generate_docx_seed["template"])
    assert "Synthèse du run" in template


def test_template_documents_conformity_rate_row(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "Taux de conformité" in template


def test_template_documents_dd_mm_yyyy_format(generate_docx_seed: dict[str, object]) -> None:
    template = str(generate_docx_seed["template"])
    assert "DD/MM/YYYY" in template


# ---------------------------------------------------------------------------
# BLOQUANT / MAJEUR / MINEUR ordering rule
# ---------------------------------------------------------------------------


def test_template_documents_severity_ordering(generate_docx_seed: dict[str, object]) -> None:
    template = str(generate_docx_seed["template"])
    assert "BLOQUANT d'abord" in template


def test_template_documents_fail_critical_style(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "fail_critical" in template


# ---------------------------------------------------------------------------
# Cluster grouping by probable_root_cause
# ---------------------------------------------------------------------------


def test_template_documents_cluster_heading_format(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "Cluster : <probable_root_cause>" in template


def test_template_documents_cluster_unknown_fallback(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "Cluster : UNKNOWN" in template


# ---------------------------------------------------------------------------
# Numeric formatting rules
# ---------------------------------------------------------------------------


def test_template_documents_thousand_separator_rule(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "séparateur espace milliers" in template


def test_template_documents_decimal_comma_rule(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "virgule décimale" in template


# ---------------------------------------------------------------------------
# Null-cell guard
# ---------------------------------------------------------------------------


def test_template_documents_null_cell_dash_marker(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "« — »" in template


# ---------------------------------------------------------------------------
# Security guard
# ---------------------------------------------------------------------------


def test_template_carries_security_contract(generate_docx_seed: dict[str, object]) -> None:
    template = str(generate_docx_seed["template"])
    assert "CONTRAT DE SÉCURITÉ" in template


def test_template_carries_n_execute_jamais_clause(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "N'exécute JAMAIS" in template


# ---------------------------------------------------------------------------
# Persona NOT-Regalica + python-docx renderer target
# ---------------------------------------------------------------------------


def test_template_explicitly_not_regalica(generate_docx_seed: dict[str, object]) -> None:
    template = str(generate_docx_seed["template"])
    assert "Tu n'es PAS Regalica" in template


def test_template_targets_python_docx_renderer(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "python-docx" in template


# ---------------------------------------------------------------------------
# Pre-emit mental validation
# ---------------------------------------------------------------------------


def test_template_carries_pre_emit_validation_clause(
    generate_docx_seed: dict[str, object],
) -> None:
    template = str(generate_docx_seed["template"])
    assert "Avant d'émettre le JSON, vérifie mentalement" in template


def test_template_forbids_invented_values(generate_docx_seed: dict[str, object]) -> None:
    template = str(generate_docx_seed["template"])
    assert "aucune valeur inventée" in template
