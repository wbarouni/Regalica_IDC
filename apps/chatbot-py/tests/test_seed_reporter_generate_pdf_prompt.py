"""Contract tests for the reporter/generate_pdf seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (json contract,
    max_tokens 8192, temperature 0.1, thinking off, gemini-2.5-flash);
  * The input_schema mirrors generate_docx (same validation_run +
    verdicts shape) — caller can dispatch a single normalised payload
    to either renderer;
  * The output_schema EXTENDS generate_docx with three PDF-specific
    styles (page_break, header, footer) for a 9-enum total. The
    template enforces a mandatory header section first + footer
    section last, a page_break before main content, and a page_break
    every 20 FAILs to avoid dense pages. Renderer target is
    WeasyPrint (NOT python-docx — the renderer-target distinction
    is part of the seed's contract surface).

Pattern established commits historique / simulation / sanction /
ambiguous / out_of_scope / general_help / extract_rule_from_xlsx /
draft_rule_from_form / extract_referential_from_pdf /
investigator_analyze_fail / compare_runs_history / generate_docx —
phrase assertions normalised via re.sub(r"\\s+", " ", template).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_generate_pdf_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "reporter" and entry["function_name"] == "generate_pdf":
            return entry
    raise AssertionError("reporter/generate_pdf entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def generate_pdf_seed() -> dict[str, object]:
    return _load_generate_pdf_entry()


@pytest.fixture
def normalised_template(generate_pdf_seed: dict[str, object]) -> str:
    return _normalise(str(generate_pdf_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_seed_canonical_inference_parameters(generate_pdf_seed: dict[str, object]) -> None:
    assert generate_pdf_seed["temperature"] == pytest.approx(0.1)
    assert generate_pdf_seed["max_tokens"] == 8192
    assert generate_pdf_seed["thinking_enabled"] is False
    assert generate_pdf_seed["target_model"] == "gemini-2.5-flash"


def test_seed_declares_output_contract_json(generate_pdf_seed: dict[str, object]) -> None:
    assert generate_pdf_seed["output_contract"] == "json"


# ---------------------------------------------------------------------------
# Difference clé vs generate_docx — style enum extended to 9 values
# ---------------------------------------------------------------------------


def test_output_style_enum_includes_page_break(
    generate_pdf_seed: dict[str, object],
) -> None:
    schema = generate_pdf_seed["output_schema"]
    item = schema["properties"]["sections"]["items"]
    assert "page_break" in item["properties"]["style"]["enum"]


def test_output_style_enum_includes_header(generate_pdf_seed: dict[str, object]) -> None:
    schema = generate_pdf_seed["output_schema"]
    item = schema["properties"]["sections"]["items"]
    assert "header" in item["properties"]["style"]["enum"]


def test_output_style_enum_includes_footer(generate_pdf_seed: dict[str, object]) -> None:
    schema = generate_pdf_seed["output_schema"]
    item = schema["properties"]["sections"]["items"]
    assert "footer" in item["properties"]["style"]["enum"]


def test_output_style_enum_is_exactly_nine_canonical_values(
    generate_pdf_seed: dict[str, object],
) -> None:
    """The DOCX 6-style set extended with page_break/header/footer for PDF."""
    schema = generate_pdf_seed["output_schema"]
    item = schema["properties"]["sections"]["items"]
    assert item["properties"]["style"]["enum"] == [
        "normal",
        "summary",
        "fail_critical",
        "fail_major",
        "pass",
        "cluster",
        "page_break",
        "header",
        "footer",
    ]


# ---------------------------------------------------------------------------
# Mandatory header / footer sections
# ---------------------------------------------------------------------------


def test_template_documents_mandatory_first_section_header(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert 'sections[0].style = "header"' in template


def test_template_documents_mandatory_last_section_footer(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert 'sections[-1].style = "footer"' in template


def test_template_documents_header_heading_label(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "En-tête" in template


def test_template_documents_footer_heading_label(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "Pied de page" in template


def test_template_carries_confidentiality_mention_in_footer(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "Usage interne confidentiel" in template


# ---------------------------------------------------------------------------
# Page-break logic
# ---------------------------------------------------------------------------


def test_template_documents_page_break_style(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "page_break" in template


def test_template_documents_page_break_every_20_fails(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "tous les 20 FAILs" in template


# ---------------------------------------------------------------------------
# Renderer target — WeasyPrint, NOT python-docx
# ---------------------------------------------------------------------------


def test_template_targets_weasyprint_renderer(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "WeasyPrint" in template


def test_template_does_not_mention_python_docx(
    generate_pdf_seed: dict[str, object],
) -> None:
    """Renderer-target distinction is part of the seed's contract surface —
    generate_pdf MUST NOT mention python-docx (that is generate_docx's
    renderer; mixing the two would confuse the LLM about which style enum
    is active).
    """
    template = str(generate_pdf_seed["template"])
    assert "python-docx" not in template


# ---------------------------------------------------------------------------
# 3 livrables documented
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "deliverable",
    ["livrable_a", "livrable_b", "livrable_c"],
)
def test_template_documents_each_livrable(
    generate_pdf_seed: dict[str, object], deliverable: str
) -> None:
    template = str(generate_pdf_seed["template"])
    assert deliverable in template


# ---------------------------------------------------------------------------
# Content logic identical to generate_docx
# ---------------------------------------------------------------------------


def test_template_documents_severity_ordering_arrow_format(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "BLOQUANT → MAJEUR → MINEUR" in template


def test_template_documents_cluster_unknown_fallback(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "Cluster : UNKNOWN" in template


def test_template_documents_dd_mm_yyyy_format(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "DD/MM/YYYY" in template


def test_template_documents_thousand_separator_rule(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "séparateur espace milliers" in template


# ---------------------------------------------------------------------------
# Security guard
# ---------------------------------------------------------------------------


def test_template_carries_security_contract(generate_pdf_seed: dict[str, object]) -> None:
    template = str(generate_pdf_seed["template"])
    assert "CONTRAT DE SÉCURITÉ" in template


# ---------------------------------------------------------------------------
# Persona NOT-Regalica
# ---------------------------------------------------------------------------


def test_template_explicitly_not_regalica(generate_pdf_seed: dict[str, object]) -> None:
    template = str(generate_pdf_seed["template"])
    assert "Tu n'es PAS Regalica" in template


# ---------------------------------------------------------------------------
# Pre-emit mental validation
# ---------------------------------------------------------------------------


def test_template_carries_pre_emit_validation_clause(
    generate_pdf_seed: dict[str, object],
) -> None:
    template = str(generate_pdf_seed["template"])
    assert "Avant d'émettre le JSON, vérifie mentalement" in template
