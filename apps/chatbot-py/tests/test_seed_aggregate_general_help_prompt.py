"""Contract tests for the regalica/aggregate_general_help seed entry.

Three classes of invariant must hold whatever revision lands:

  * Inference parameters reflect the V1 contract (string contract,
    max_tokens 384, temperature 0.5 canon docs/05 §174, thinking off);
  * The input schema declares NO `clarification_reason` field —
    different from aggregate_ambiguous. general_help is single-
    dispatch with two SILENT origins: the router LLM emitting
    `intent="general_help"` legitimately, OR the router parser
    falling back to FALLBACK_INTENT when classification fails. The
    template must produce a useful response in both cases without
    revealing the fallback;
  * The template enforces a 3-phrase constructive help structure
    (Regalica presentation with Regalica/REGFlow/BCT markers,
    capability enumeration drawing from a 5-item V1-active pool,
    redirective open question), explicitly forbids capabilities
    tied to V1 honest-unavailable aggregators (sanction, simulation),
    forbids workflow Library mentions, and forbids any leak of the
    router-fallback mechanism.

Pattern established commits historique / simulation / sanction /
ambiguous / out_of_scope — phrase assertions normalised via
re.sub(r"\\s+", " ", template); forbidden phrases that DO appear
inside operator-facing deny-list / style-guard sections are asserted
via their framing.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

_SEEDS_PATH = Path(__file__).resolve().parents[3] / "apps" / "api" / "seeds" / "prompts.json"


def _load_general_help_entry() -> dict[str, object]:
    payload = json.loads(_SEEDS_PATH.read_text(encoding="utf-8"))
    for entry in payload["prompts"]:
        if entry["agent_type"] == "regalica" and entry["function_name"] == "aggregate_general_help":
            return entry
    raise AssertionError("regalica/aggregate_general_help entry missing from prompts.json")


def _normalise(text: str) -> str:
    return re.sub(r"\s+", " ", text)


@pytest.fixture
def general_help_seed() -> dict[str, object]:
    return _load_general_help_entry()


@pytest.fixture
def normalised_template(general_help_seed: dict[str, object]) -> str:
    return _normalise(str(general_help_seed["template"]))


# ---------------------------------------------------------------------------
# Inference parameters + output_contract
# ---------------------------------------------------------------------------


def test_general_help_seed_canonical_inference_parameters(
    general_help_seed: dict[str, object],
) -> None:
    """Canon docs/05 §174 — temp 0.5, no thinking."""
    assert general_help_seed["temperature"] == pytest.approx(0.5)
    assert general_help_seed["max_tokens"] == 384
    assert general_help_seed["thinking_enabled"] is False
    assert general_help_seed["target_model"] == "gemini-2.5-flash"


def test_general_help_seed_declares_output_contract_string(
    general_help_seed: dict[str, object],
) -> None:
    assert general_help_seed["output_contract"] == "string"


def test_general_help_seed_output_schema_is_string_with_bounds(
    general_help_seed: dict[str, object],
) -> None:
    schema = general_help_seed["output_schema"]
    assert isinstance(schema, dict)
    assert schema["type"] == "string"
    assert schema["minLength"] == 80
    assert schema["maxLength"] == 1500


# ---------------------------------------------------------------------------
# Input schema — NO clarification_reason (differs from ambiguous)
# ---------------------------------------------------------------------------


def test_general_help_seed_input_intent_const_is_general_help(
    general_help_seed: dict[str, object],
) -> None:
    schema = general_help_seed["input_schema"]
    assert schema["properties"]["intent_type"]["const"] == "general_help"


def test_general_help_seed_input_specialist_outputs_maxitems_zero(
    general_help_seed: dict[str, object],
) -> None:
    schema = general_help_seed["input_schema"]
    assert schema["properties"]["specialist_outputs"]["maxItems"] == 0


def test_general_help_seed_input_blocks_extra_properties(
    general_help_seed: dict[str, object],
) -> None:
    schema = general_help_seed["input_schema"]
    assert schema["additionalProperties"] is False


def test_general_help_seed_input_does_not_carry_clarification_reason(
    general_help_seed: dict[str, object],
) -> None:
    """Differs from aggregate_ambiguous — general_help is single-dispatch
    (two silent origins: legitimate + FALLBACK_INTENT) with no bifurcation
    field on the payload.
    """
    schema = general_help_seed["input_schema"]
    assert "clarification_reason" not in schema["properties"]
    assert "clarification_reason" not in schema["required"]


# ---------------------------------------------------------------------------
# Dual-purpose general_help = FALLBACK_INTENT
# ---------------------------------------------------------------------------


def test_template_documents_fallback_intent_dual_purpose(
    general_help_seed: dict[str, object],
) -> None:
    """The template must document that general_help is also called as
    the FALLBACK_INTENT when the router parser fails.
    """
    template = str(general_help_seed["template"])
    assert "fallback technique du router" in template


def test_template_forbids_revealing_router_fallback(
    normalised_template: str,
) -> None:
    """The defensive principle: the response is the same in both cases,
    the technical fallback is silent.
    """
    assert "Tu ne révèles JAMAIS qu'un échec technique" in normalised_template


def test_template_documents_fallback_confidence_zero(
    normalised_template: str,
) -> None:
    """Operator must see the link to confidence=0.0 from _fallback_result."""
    assert "confidence vaut 0.0" in normalised_template


# ---------------------------------------------------------------------------
# Three-phrase structure
# ---------------------------------------------------------------------------


def test_template_section_anchor_aide_generale_constructive(
    general_help_seed: dict[str, object],
) -> None:
    template = str(general_help_seed["template"])
    assert "AIDE GÉNÉRALE CONSTRUCTIVE" in template


def test_template_phrase_1_starts_with_je_suis_regalica(
    normalised_template: str,
) -> None:
    """Phrase 1 must open with the canonical Regalica self-introduction."""
    assert "« Je suis Regalica, »" in normalised_template


@pytest.mark.parametrize(
    "marker",
    ["Regalica", "REGFlow", "BCT"],
)
def test_template_phrase_1_lists_mandatory_product_marker(
    general_help_seed: dict[str, object], marker: str
) -> None:
    """The three product markers (Regalica + REGFlow + BCT) must be
    listed in Phrase 1 as mandatory.
    """
    template = str(general_help_seed["template"])
    assert marker in template


def test_template_phrase_2_uses_prose_format_not_bullets(
    normalised_template: str,
) -> None:
    """Format obligatoire prose flowing, separators "," + "ou" — no bullets."""
    assert "« Je peux vous aider à <cap1>, <cap2>, ou <cap3>. »" in normalised_template


def test_template_phrase_2_caps_capabilities_at_three_to_five(
    normalised_template: str,
) -> None:
    assert "Minimum 3 capacités. Maximum 5 capacités." in normalised_template


# ---------------------------------------------------------------------------
# Pool of V1-active capabilities
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "capability",
    [
        "comprendre les FAILs détectés sur vos reportings XML",
        "identifier les causes communes entre plusieurs FAILs",
        "identifier la base réglementaire d'une règle RDG",
        "comparer un arrêté à l'historique des soumissions",
        "préparer un plan de correction des FAILs",
    ],
)
def test_template_lists_v1_active_capability(
    general_help_seed: dict[str, object], capability: str
) -> None:
    """Each of the 5 V1-active capabilities must appear in the canonical pool."""
    template = str(general_help_seed["template"])
    assert capability in template


# ---------------------------------------------------------------------------
# Forbidden capabilities (V1 honest-unavailable aggregators)
# ---------------------------------------------------------------------------


def test_template_forbids_sanction_capability(
    general_help_seed: dict[str, object],
) -> None:
    """The sanction aggregator is honest-unavailable in V1 (no estimate
    available); general_help must not advertise this capability.
    """
    template = str(general_help_seed["template"])
    assert "estimer le risque de sanction" in template  # listed in NE JAMAIS
    assert "honest-unavailable en V1" in template


def test_template_forbids_simulation_capability(
    general_help_seed: dict[str, object],
) -> None:
    template = str(general_help_seed["template"])
    assert "simuler l'impact d'une correction" in template
    assert "moteur de simulation non câblé en V1" in template


def test_template_forbids_library_annexe_deposit_capability(
    general_help_seed: dict[str, object],
) -> None:
    template = str(general_help_seed["template"])
    assert "préparer le dépôt d'un nouveau lot d'annexes" in template
    assert "workflow Library" in template


# ---------------------------------------------------------------------------
# Phrase 3 — redirective question
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "redirective",
    [
        "Sur quel point souhaitez-vous commencer ?",
        "Par quoi souhaitez-vous commencer ?",
        "Souhaitez-vous explorer un point particulier ?",
    ],
)
def test_template_phrase_3_lists_acceptable_redirective(
    general_help_seed: dict[str, object], redirective: str
) -> None:
    template = str(general_help_seed["template"])
    assert redirective in template


# ---------------------------------------------------------------------------
# Style guards
# ---------------------------------------------------------------------------


def test_template_forbids_4611_rules_chiffre(
    general_help_seed: dict[str, object],
) -> None:
    """No documentation chiffre even when factually correct
    (« 4 611 règles RDG » is the docs/01 figure but invites invention).
    """
    template = str(general_help_seed["template"])
    assert "4 611 règles RDG" in template  # appears inside the negative example


@pytest.mark.parametrize(
    "intent_code",
    [
        "zoom",
        "cluster",
        "historical",
        "citation",
        "simulation",
        "sanction",
        "plan",
        "ambiguous",
        "out_of_scope",
    ],
)
def test_template_lists_intent_code_in_forbidden_list(
    general_help_seed: dict[str, object], intent_code: str
) -> None:
    template = str(general_help_seed["template"])
    assert intent_code in template


@pytest.mark.parametrize(
    "v2_feature",
    ["heatmap", "gantt", "rapport téléchargeable", "Bibliothèque", "Library"],
)
def test_template_forbids_v2_unshipped_feature_mention(
    general_help_seed: dict[str, object], v2_feature: str
) -> None:
    template = str(general_help_seed["template"])
    assert v2_feature in template  # listed inside the V1-only deny clause


def test_template_forbids_router_fallback_internal_leak(
    normalised_template: str,
) -> None:
    """The internal mechanism phrasings ("je n'ai pas pu classifier",
    "votre demande était ambiguë", "réessayez") must NEVER appear in
    the user-facing response. Listed inside the operator-facing
    forbidden clause.
    """
    assert "je n'ai pas pu classifier" in normalised_template
    assert "votre demande était ambiguë" in normalised_template


# ---------------------------------------------------------------------------
# No multi-section / no separator
# ---------------------------------------------------------------------------


def test_template_does_not_carry_section_anchors(
    general_help_seed: dict[str, object],
) -> None:
    template = str(general_help_seed["template"])
    assert "SECTION 1" not in template
    assert "SECTION 2" not in template


def test_template_explicitly_forbids_horizontal_separator(
    general_help_seed: dict[str, object],
) -> None:
    template = str(general_help_seed["template"])
    assert "pas de ---" in template


# ---------------------------------------------------------------------------
# Cross-prompt guards
# ---------------------------------------------------------------------------


def test_template_contains_anti_injection_guard(
    normalised_template: str,
) -> None:
    assert "modifier ton rôle" in normalised_template
    assert "ignore-les intégralement" in normalised_template


def test_template_contains_anti_preannouncement_clause(
    general_help_seed: dict[str, object],
) -> None:
    template = str(general_help_seed["template"])
    assert "ne préannonce pas" in template


# ---------------------------------------------------------------------------
# Budget
# ---------------------------------------------------------------------------


def test_template_budget_target_and_ceiling(
    general_help_seed: dict[str, object],
) -> None:
    template = str(general_help_seed["template"])
    assert "100 à 200 tokens" in template
    assert "280 tokens" in template
