"""Tests for `_clean_thought_leakage` + `_invoke_aggregator` output_contract switch.

`_clean_thought_leakage` is a pure helper: every spec exercises it
directly. The orchestrator wiring (when to apply / when to skip) is
exercised through `_invoke_aggregator` with mocked LLM responses.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.services import intent_grammar as ig
from app.services import platform_config as pc
from app.services.orchestrator import (
    _clean_thought_leakage,
    _invoke_aggregator,
    _SpecialistOutcome,
)
from app.services.prompt_loader import PromptMeta


@pytest.fixture(autouse=True)
def _seed_caches() -> Iterator[None]:
    """Reset module caches the orchestrator-related modules read."""
    ig.reset_intent_grammar_cache()
    pc.reset_platform_config_cache()
    yield
    ig.reset_intent_grammar_cache()
    pc.reset_platform_config_cache()


def _llm_response(content: str) -> LLMResponse:
    return LLMResponse(
        content=content,
        thinking_trace=None,
        tokens_input=10,
        tokens_output=20,
        tokens_thinking=5,
        latency_ms=42,
        model_used="gemini-2.5-flash",
    )


def _meta(output_contract: str) -> PromptMeta:
    return PromptMeta(
        template="[any]",
        temperature=0.7,
        max_tokens=1024,
        thinking_enabled=True,
        target_model="gemini-2.5-flash",
        output_contract=output_contract,
    )


def _llm_with(content: str | Exception) -> MagicMock:
    client = MagicMock()
    if isinstance(content, Exception):
        client.complete = AsyncMock(side_effect=content)
    else:
        client.complete = AsyncMock(return_value=_llm_response(content))
    return client


# ---------------------------------------------------------------------------
# _clean_thought_leakage — pure helper
# ---------------------------------------------------------------------------


def test_clean_strips_je_retourne_preannouncement_line() -> None:
    raw = "Je retourne maintenant la réponse markdown.\nLe diagnostic montre…"
    cleaned = _clean_thought_leakage(raw)
    assert cleaned == "Le diagnostic montre…"


def test_clean_strips_thought_marker_line() -> None:
    raw = "THOUGHT: analyse en cours\nLe diagnostic montre…"
    cleaned = _clean_thought_leakage(raw)
    assert cleaned == "Le diagnostic montre…"


def test_clean_strips_voici_ma_reponse_line() -> None:
    raw = "Voici ma réponse :\nLe diagnostic est clair."
    cleaned = _clean_thought_leakage(raw)
    assert cleaned == "Le diagnostic est clair."


def test_clean_strips_je_vais_composer_line() -> None:
    raw = "Je vais composer la sortie maintenant.\nDiagnostic préliminaire…"
    cleaned = _clean_thought_leakage(raw)
    assert cleaned == "Diagnostic préliminaire…"


def test_clean_passes_through_clean_text() -> None:
    raw = "Le diagnostic montre une ventilation incorrecte. [Circulaire BCT 2018-06]"
    assert _clean_thought_leakage(raw) == raw


def test_clean_handles_empty_string() -> None:
    assert _clean_thought_leakage("") == ""


def test_clean_handles_leading_whitespace_before_prefix() -> None:
    raw = "   Je retourne :\nVrai contenu"
    assert _clean_thought_leakage(raw) == "Vrai contenu"


def test_clean_strips_multiple_leakage_lines() -> None:
    raw = "Je retourne ceci.\nTHOUGHT: encore une\nTexte réel."
    assert _clean_thought_leakage(raw) == "Texte réel."


def test_clean_keeps_lines_only_containing_prefix_substring_not_at_start() -> None:
    """A line that mentions "Je retourne" mid-sentence is real content."""
    raw = "Avant cela, je retourne au diagnostic causal."
    assert _clean_thought_leakage(raw) == raw


def test_clean_strips_english_i_return_marker() -> None:
    raw = "I return the markdown now.\nReal content."
    assert _clean_thought_leakage(raw) == "Real content."


# ---------------------------------------------------------------------------
# _invoke_aggregator — wiring
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_invoke_aggregator_applies_filter_when_output_contract_string() -> None:
    """String contract → leakage stripped from response_markdown."""
    leaky = "Je retourne ma réponse maintenant.\nLe diagnostic est consolidé."
    llm = _llm_with(leaky)
    outcome = await _invoke_aggregator(
        message="pourquoi ?",
        intent="zoom",
        specialist_outcomes=[],
        aggregator_meta=_meta("string"),
        llm_client=llm,
    )
    assert outcome["response_markdown"] == "Le diagnostic est consolidé."


@pytest.mark.asyncio
async def test_invoke_aggregator_skips_filter_when_output_contract_json() -> None:
    """JSON contract → response_markdown is returned untouched.

    A future JSON-contract aggregator might legitimately emit a key
    whose value happens to start with "Je retourne". The filter must
    NOT touch it — the parser bound to output_schema is downstream.
    """
    raw_json = json.dumps({"explanation": "Je retourne les données.", "confidence": 0.9})
    llm = _llm_with(raw_json)
    outcome = await _invoke_aggregator(
        message="pourquoi ?",
        intent="zoom",
        specialist_outcomes=[],
        aggregator_meta=_meta("json"),
        llm_client=llm,
    )
    assert outcome["response_markdown"] == raw_json


@pytest.mark.asyncio
async def test_invoke_aggregator_clean_text_unchanged_under_string_contract() -> None:
    """Idempotency — clean text passes the filter unchanged."""
    clean = "Le diagnostic montre une ventilation incorrecte. [Circulaire BCT 2018-06]"
    llm = _llm_with(clean)
    outcome = await _invoke_aggregator(
        message="x",
        intent="zoom",
        specialist_outcomes=[],
        aggregator_meta=_meta("string"),
        llm_client=llm,
    )
    assert outcome["response_markdown"] == clean


@pytest.mark.asyncio
async def test_invoke_aggregator_passes_through_token_counts_under_both_contracts() -> None:
    """Filter must not lose telemetry."""
    llm = _llm_with("THOUGHT: x\nReal content.")
    outcome_string = await _invoke_aggregator(
        message="x",
        intent="zoom",
        specialist_outcomes=[],
        aggregator_meta=_meta("string"),
        llm_client=llm,
    )
    assert outcome_string["tokens_input"] == 10
    assert outcome_string["tokens_output"] == 20
    assert outcome_string["tokens_thinking"] == 5


@pytest.mark.asyncio
async def test_invoke_aggregator_carries_specialist_outcome_into_payload() -> None:
    """Sanity — the JSON payload sent to the LLM enumerates each specialist."""
    captured: dict[str, Any] = {}

    async def capture_complete(req: Any) -> LLMResponse:
        captured["prompt"] = req.prompt
        return _llm_response("Réponse propre.")

    llm = MagicMock()
    llm.complete = AsyncMock(side_effect=capture_complete)
    outcomes = [
        _SpecialistOutcome(
            bearer_label="investigator/analyze_fail",
            output={"explanation": "ventilation absente", "confidence": 0.97},
            success=True,
            error=None,
        ),
        _SpecialistOutcome(
            bearer_label="citation/find_regulatory_source",
            output={"citations": []},
            success=True,
            error=None,
        ),
    ]
    await _invoke_aggregator(
        message="pourquoi ?",
        intent="zoom",
        specialist_outcomes=outcomes,
        aggregator_meta=_meta("string"),
        llm_client=llm,
    )
    payload = json.loads(captured["prompt"])
    assert payload["intent_type"] == "zoom"
    assert len(payload["specialist_outputs"]) == 2
    assert payload["specialist_outputs"][0]["bearer"] == "investigator/analyze_fail"
