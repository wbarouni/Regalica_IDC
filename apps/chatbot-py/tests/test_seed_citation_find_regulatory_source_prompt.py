"""Contract tests for the citation/find_regulatory_source seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (json contract,
    max_tokens 1024, temperature 0.1, thinking off, gemini-2.5-flash);
  * The input_schema accepts the rule context (ax_term, num_regle,
    expression, annexe_code, tenant_id) — no intent_type, no
    specialist_outputs (this is a single-rule lookup specialist,
    NOT an aggregator);
  * The output_schema produces a 5-field flat citation envelope
    (circulaire, article, paragraphe, texte_pertinent, confidence)
    — all string fields nullable, confidence ∈ [0.0, 1.0] capped
    at 0.75 in V1. The template documents the absence of RAG in V1
    (Phase 4 deferral) as the rationale for the cap, enumerates a
    4-type rule classification (COHERENCE_BILANTAIRE, COHERENCE_XML,
    CONTROLE_QUALITE, INCONNU), and enforces an anti-invention guard
    that prefers null-honest fields over fabricated references.

Pattern established commits historique / simulation / sanction /
ambiguous / out_of_scope / general_help / extract_rule_from_xlsx /
draft_rule_from_form / extract_referential_from_pdf /
investigator_analyze_fail / compare_runs_history / generate_docx /
generate_pdf / produce_chart — phrase assertions normalised via
re.sub(r"\\s+", " ", template).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_find_regulatory_source_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "citation" and entry["function_name"] == "find_regulatory_source":
            return entry
    raise AssertionError("citation/find_regulatory_source entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def find_regulatory_source_seed() -> dict[str, object]:
    return _load_find_regulatory_source_entry()


@pytest.fixture
def normalised_template(find_regulatory_source_seed: dict[str, object]) -> str:
    return _normalise(str(find_regulatory_source_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_seed_canonical_inference_parameters(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    assert find_regulatory_source_seed["temperature"] == pytest.approx(0.1)
    assert find_regulatory_source_seed["max_tokens"] == 1024
    assert find_regulatory_source_seed["thinking_enabled"] is False
    assert find_regulatory_source_seed["target_model"] == "gemini-2.5-flash"


def test_seed_declares_output_contract_json(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    assert find_regulatory_source_seed["output_contract"] == "json"


# ---------------------------------------------------------------------------
# input_schema — rule context only, no intent_type
# ---------------------------------------------------------------------------


def test_input_schema_required_fields(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    schema = find_regulatory_source_seed["input_schema"]
    assert set(schema["required"]) == {
        "ax_term",
        "num_regle",
        "expression",
        "annexe_code",
        "tenant_id",
    }


def test_input_schema_blocks_extra_properties(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    schema = find_regulatory_source_seed["input_schema"]
    assert schema["additionalProperties"] is False


def test_input_schema_does_not_carry_intent_type(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    """Specialist agent — never receives intent_type."""
    schema = find_regulatory_source_seed["input_schema"]
    assert "intent_type" not in schema["properties"]


# ---------------------------------------------------------------------------
# output_schema — 5-field flat envelope
# ---------------------------------------------------------------------------


def test_output_schema_required_fields(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    schema = find_regulatory_source_seed["output_schema"]
    assert set(schema["required"]) == {
        "circulaire",
        "article",
        "paragraphe",
        "texte_pertinent",
        "confidence",
    }


def test_output_schema_blocks_extra_properties(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    schema = find_regulatory_source_seed["output_schema"]
    assert schema["additionalProperties"] is False


@pytest.mark.parametrize(
    "field",
    ["circulaire", "article", "paragraphe", "texte_pertinent"],
)
def test_output_string_fields_are_nullable(
    find_regulatory_source_seed: dict[str, object], field: str
) -> None:
    """All string fields are nullable — null-honest fallback when the LLM
    cannot identify the reference with certainty.
    """
    schema = find_regulatory_source_seed["output_schema"]
    field_schema = schema["properties"][field]
    assert "null" in field_schema["type"]
    assert "string" in field_schema["type"]


def test_output_confidence_bounds(find_regulatory_source_seed: dict[str, object]) -> None:
    schema = find_regulatory_source_seed["output_schema"]
    conf = schema["properties"]["confidence"]
    assert conf["minimum"] == 0.0
    assert conf["maximum"] == 1.0


# ---------------------------------------------------------------------------
# NOTE V1 — RAG absent doctrine
# ---------------------------------------------------------------------------


def test_template_documents_rag_absence_v1(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "ABSENCE DE RAG" in template


def test_template_documents_rag_phase_4_deferral(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "Phase 4" in template


def test_template_mentions_rag_pgvector_v2_target(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "RAG pgvector" in template


def test_template_documents_v1_confidence_cap_rationale(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "plafonnée à 0.75 en V1" in template


# ---------------------------------------------------------------------------
# Confidence V1 cap enforcement
# ---------------------------------------------------------------------------


def test_template_pre_emit_confidence_cap_clause(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "confidence ≤ 0.75 (plafond V1 strict)" in template


def test_template_documents_min_capping_arithmetic(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "min(valeur calculée" in template


def test_template_locks_against_confidence_above_cap(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "Ne jamais retourner confidence > 0.75" in template


# ---------------------------------------------------------------------------
# texte_pertinent always null in V1
# ---------------------------------------------------------------------------


def test_template_pins_texte_pertinent_null_v1(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "texte_pertinent = null" in template


def test_template_documents_texte_pertinent_always_null_v1(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "TOUJOURS null en V1" in template


# ---------------------------------------------------------------------------
# 4-type rule classification
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "rule_type",
    ["COHERENCE_BILANTAIRE", "COHERENCE_XML", "CONTROLE_QUALITE", "INCONNU"],
)
def test_template_documents_each_rule_type(
    find_regulatory_source_seed: dict[str, object], rule_type: str
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert rule_type in template


# ---------------------------------------------------------------------------
# Reference 2017-06 + CC-Tech BCT
# ---------------------------------------------------------------------------


def test_template_documents_circulaire_2017_06_reference(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "2017-06" in template


def test_template_documents_cc_tech_bct_reference(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "CC-Tech BCT" in template


# ---------------------------------------------------------------------------
# Anti-invention guard
# ---------------------------------------------------------------------------


def test_template_carries_anti_invention_section(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "anti-invention" in template


def test_template_documents_null_honest_preference(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "Une référence nulle honnête" in template


def test_template_documents_no_invented_reference_clause(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "mieux qu'une référence inventée" in template


# ---------------------------------------------------------------------------
# Cross-prompt coherence with aggregate_citation_reglementaire
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "field",
    ["circulaire", "article", "paragraphe", "texte_pertinent", "confidence"],
)
def test_output_schema_field_name_matches_aggregate_citation_reglementaire(
    find_regulatory_source_seed: dict[str, object], field: str
) -> None:
    """aggregate_citation_reglementaire consumes these key NAMES from
    citation.output (the type contract may differ — confidence is a
    numeric cap here vs aggregate's legacy string enum; that divergence
    will be reconciled when the aggregator is realigned in a separate
    commit).
    """
    schema = find_regulatory_source_seed["output_schema"]
    assert field in schema["properties"]


# ---------------------------------------------------------------------------
# Security guard
# ---------------------------------------------------------------------------


def test_template_carries_security_contract(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "CONTRAT DE SÉCURITÉ" in template


# ---------------------------------------------------------------------------
# Persona NOT-Regalica
# ---------------------------------------------------------------------------


def test_template_explicitly_not_regalica(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "Tu n'es PAS Regalica" in template


# ---------------------------------------------------------------------------
# Pre-emit mental validation
# ---------------------------------------------------------------------------


def test_template_carries_pre_emit_validation_clause(
    find_regulatory_source_seed: dict[str, object],
) -> None:
    template = str(find_regulatory_source_seed["template"])
    assert "Avant d'émettre le JSON, vérifie mentalement" in template
