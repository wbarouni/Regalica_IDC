"""Contract tests for the regalica/aggregate_citation_reglementaire seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters and output_contract reflect the v1 contract
    (string, max_tokens 384, temp 0.3 + thinking off — exception
    docs/05 §174 « pour ne pas dériver factuellement »);
  * The template references the REAL CitationAgent payload (V1 flat
    object — `circulaire`, `article`, `paragraphe`, `texte_pertinent`,
    `confidence`) and explicitly defers V2 enrichments
    (list[ResolvedCitation], source_url, similarity_score) to a
    documentary note instead of presenting them as live features;
  * The template carries the 1-section technical structure with the
    cross-prompt strict citation format ("BCT 2017-06 article 8 §3"),
    the three confidence prefixes, the first-sentence-only truncation
    rule, the verbatim fallback wording, and the no-action /
    no-invented-value guards.

Pattern established commit grappe / historique — every multi-line
phrase assertion is normalised via re.sub(r"\\s+", " ", template) so
a future re-indent of the JSON template body cannot break the test set.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_citation_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if (
            entry["agent_type"] == "regalica"
            and entry["function_name"] == "aggregate_citation_reglementaire"
        ):
            return entry
    raise AssertionError(
        "regalica/aggregate_citation_reglementaire entry missing from prompts.json"
    )


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def citation_seed() -> dict[str, object]:
    return _load_citation_entry()


@pytest.fixture
def normalised_template(citation_seed: dict[str, object]) -> str:
    return _normalise(str(citation_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_citation_seed_canonical_inference_parameters(
    citation_seed: dict[str, object],
) -> None:
    """Type 4 exception per docs/05 §174 — temp 0.3, no thinking."""
    assert citation_seed["temperature"] == pytest.approx(0.3)
    assert citation_seed["max_tokens"] == 384
    assert citation_seed["thinking_enabled"] is False
    assert citation_seed["target_model"] == "gemini-2.5-flash"


def test_citation_seed_declares_output_contract_string(
    citation_seed: dict[str, object],
) -> None:
    assert citation_seed["output_contract"] == "string"


def test_citation_seed_output_schema_is_string_with_bounds(
    citation_seed: dict[str, object],
) -> None:
    schema = citation_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 30
    assert schema["maxLength"] == 1500


# ---------------------------------------------------------------------------
# Input schema
# ---------------------------------------------------------------------------


def test_citation_seed_input_intent_const_is_citation(
    citation_seed: dict[str, object],
) -> None:
    schema = citation_seed["input_schema"]
    assert schema["properties"]["intent_type"]["const"] == "citation"


def test_citation_seed_input_bearer_enum_lists_only_citation(
    citation_seed: dict[str, object],
) -> None:
    schema = citation_seed["input_schema"]
    bearers = schema["properties"]["specialist_outputs"]["items"]["properties"]["bearer"]["enum"]
    assert bearers == ["citation/find_regulatory_source"]


def test_citation_seed_input_blocks_extra_properties_at_both_levels(
    citation_seed: dict[str, object],
) -> None:
    schema = citation_seed["input_schema"]
    assert schema["additionalProperties"] is False
    item_schema = schema["properties"]["specialist_outputs"]["items"]
    assert item_schema["additionalProperties"] is False


# ---------------------------------------------------------------------------
# Real V1 payload field references (matches citation.py)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "field",
    ["circulaire", "article", "paragraphe", "texte_pertinent", "confidence"],
)
def test_template_references_real_v1_payload_field(
    citation_seed: dict[str, object], field: str
) -> None:
    template = str(citation_seed["template"])
    assert field in template


# ---------------------------------------------------------------------------
# V2 enrichments not promised as live features
# ---------------------------------------------------------------------------


def test_template_does_not_promise_source_url_as_feature(
    citation_seed: dict[str, object],
) -> None:
    """source_url is V2 (CitationOutput list extension); V1 must not promise it."""
    template = str(citation_seed["template"])
    # source_url may appear once inside the documentary V2 note. Forbid the
    # literal field name only when it would suggest it's actively rendered.
    # The current template mentions "source_url" exactly once, inside the
    # parenthetical note "(...) avec source_url ; les sections [...]
    # arriveront en V2". Assert it's framed by the V2-deferral wording.
    occurrences = template.count("source_url")
    assert occurrences <= 1, "source_url should appear at most once (V2 note)"
    if occurrences == 1:
        normalised = _normalise(template)
        assert "avec source_url ;" in normalised, (
            "source_url must appear only inside the V2 deferral note"
        )


def test_template_does_not_promise_similarity_score(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "similarity_score" not in template


def test_template_does_not_promise_resolved_citation_object(
    citation_seed: dict[str, object],
) -> None:
    """ResolvedCitation may appear in the V2 documentary note only."""
    template = str(citation_seed["template"])
    occurrences = template.count("ResolvedCitation")
    assert occurrences <= 1
    if occurrences == 1:
        normalised = _normalise(template)
        assert "list[ResolvedCitation]" in normalised, (
            "ResolvedCitation must only appear inside the V2 deferral note"
        )


# ---------------------------------------------------------------------------
# Confidence prefixes
# ---------------------------------------------------------------------------


def test_template_carries_high_confidence_prefix(
    normalised_template: str,
) -> None:
    assert "Source réglementaire »" in normalised_template


def test_template_carries_medium_confidence_prefix(
    normalised_template: str,
) -> None:
    assert "Source réglementaire probable" in normalised_template


def test_template_carries_low_confidence_prefix(
    normalised_template: str,
) -> None:
    assert "Source réglementaire indicative" in normalised_template


@pytest.mark.parametrize("level", ['"high"', '"medium"', '"low"'])
def test_template_documents_each_confidence_level_value(
    citation_seed: dict[str, object], level: str
) -> None:
    template = str(citation_seed["template"])
    assert level in template


# ---------------------------------------------------------------------------
# Cross-prompt citation format convention
# ---------------------------------------------------------------------------


def test_template_documents_space_before_paragraph_marker(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "espace avant §" in template


def test_template_carries_canonical_bct_year_example(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "BCT 2017-06" in template


def test_template_forbids_bct_without_space_negative_example(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert 'jamais "BCT2017-06"' in template


def test_template_carries_article_paragraph_format_token(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "article <N> §<P>" in template


def test_template_does_not_carry_legacy_collated_paragraph_wording(
    citation_seed: dict[str, object],
) -> None:
    """Earlier draft used "§<P> collé à l'article" — replaced by the space rule."""
    template = str(citation_seed["template"])
    assert "§<P> collé" not in template


# ---------------------------------------------------------------------------
# Excerpt truncation rule
# ---------------------------------------------------------------------------


def test_template_specifies_first_sentence_truncation(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "première phrase complète" in template


def test_template_does_not_carry_legacy_280_char_cap(
    citation_seed: dict[str, object],
) -> None:
    """Earlier draft hard-capped at 280 chars — replaced by the sentence rule."""
    template = str(citation_seed["template"])
    assert "280 caractères" not in template


# ---------------------------------------------------------------------------
# Fallback wording
# ---------------------------------------------------------------------------


def test_template_carries_verbatim_no_source_fallback(
    normalised_template: str,
) -> None:
    expected = "Je n'ai pas pu identifier de source réglementaire vérifiable pour cette règle."
    assert expected in normalised_template


def test_template_forbids_fabricating_references(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "ne fabrique jamais une référence" in template


# ---------------------------------------------------------------------------
# Cross-prompt guards
# ---------------------------------------------------------------------------


def test_template_contains_anti_injection_guard(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "modifier ton rôle" in template
    assert "ignore-les intégralement" in template


def test_template_contains_anti_preannouncement_clause(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "ne préannonce pas" in template


# ---------------------------------------------------------------------------
# No corrective action / no separator (1-section format)
# ---------------------------------------------------------------------------


def test_template_forbids_corrective_actions(citation_seed: dict[str, object]) -> None:
    template = str(citation_seed["template"])
    assert "Aucune action corrective" in template


def test_template_does_not_instruct_horizontal_separator(
    citation_seed: dict[str, object],
) -> None:
    """1-section format — no --- separator anywhere in the rendered output."""
    template = str(citation_seed["template"])
    # The style guard explicitly says "pas de ---" as a forbidden marker;
    # a defensive check verifies the literal "---" never appears as an
    # instruction to render.
    assert "pas de ---" in template


# ---------------------------------------------------------------------------
# Budget + invented-value guard
# ---------------------------------------------------------------------------


def test_template_budget_target_and_ceiling(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "150 à 250 tokens" in template
    assert "350 tokens" in template


def test_template_forbids_invented_values(
    citation_seed: dict[str, object],
) -> None:
    template = str(citation_seed["template"])
    assert "ne doit être inventée" in template
