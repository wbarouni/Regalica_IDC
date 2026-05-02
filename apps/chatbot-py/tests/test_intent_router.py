"""Unit tests for `app.services.intent_router.detect_intent`.

Pure in-process: no network, no DB. The LLM client is replaced
with an `AsyncMock` whose `complete` method returns canned
`LLMResponse` payloads.

Since commit C8 the closed intent enum lives in the DB grammar
(`intent_specialists`), not in source. The tests below pass an
explicit `valid_intents` argument that mirrors the canonical
seed (migration 065): the 7 user-facing chips + the 3 ambient
intents.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.services.intent_router import (
    FALLBACK_INTENT,
    IntentResult,
    detect_intent,
)

# Canonical seed from migration 065 — short user-facing fn_name from
# question_types + the 3 ambient intents. Using a frozenset matches
# the production type returned by IntentGrammar.intent_types.
CANONICAL_INTENTS = frozenset(
    {
        "zoom",
        "cluster",
        "historical",
        "citation",
        "simulation",
        "sanction",
        "plan",
        "general_help",
        "out_of_scope",
        "ambiguous",
    }
)


def _llm_response(content: str) -> LLMResponse:
    return LLMResponse(
        content=content,
        thinking_trace=None,
        tokens_input=10,
        tokens_output=5,
        tokens_thinking=0,
        latency_ms=20,
        model_used="gemini-2.5-flash",
    )


def _llm_with(content: str | Exception) -> MagicMock:
    client = MagicMock()
    if isinstance(content, Exception):
        client.complete = AsyncMock(side_effect=content)
    else:
        client.complete = AsyncMock(return_value=_llm_response(content))
    return client


@pytest.mark.parametrize("label", sorted(CANONICAL_INTENTS))
@pytest.mark.asyncio
async def test_detect_intent_accepts_each_canonical_value(label: str) -> None:
    """Every canonical intent emitted by the router LLM is parsed verbatim."""
    payload = json.dumps({"intent": label, "confidence": 0.92})
    llm = _llm_with(payload)
    result = await detect_intent(
        message="anything",
        llm_client=llm,
        router_template="[REGALICA_ROUTER_V1]",
        valid_intents=CANONICAL_INTENTS,
    )
    assert isinstance(result, IntentResult)
    assert result.intent_type == label
    assert result.confidence == pytest.approx(0.92)
    assert result.reasoning is None


@pytest.mark.asyncio
async def test_detect_intent_extracts_confidence_as_float() -> None:
    payload = json.dumps({"intent": "zoom", "confidence": 1})
    llm = _llm_with(payload)
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert isinstance(result.confidence, float)
    assert result.confidence == 1.0


@pytest.mark.asyncio
async def test_detect_intent_extracts_optional_reasoning() -> None:
    payload = json.dumps(
        {
            "intent": "cluster",
            "confidence": 0.81,
            "reasoning": "FAILs successifs sur la même annexe",
        }
    )
    llm = _llm_with(payload)
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == "cluster"
    assert result.reasoning == "FAILs successifs sur la même annexe"


@pytest.mark.asyncio
async def test_detect_intent_falls_back_on_invalid_json() -> None:
    llm = _llm_with("not a json blob at all")
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0
    assert result.reasoning is None


@pytest.mark.asyncio
async def test_detect_intent_falls_back_when_intent_key_missing() -> None:
    llm = _llm_with(json.dumps({"confidence": 0.99}))
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_reads_intent_key_not_intent_type() -> None:
    """Router parser contract: only the `intent` key drives classification.

    Doctrine alignment with the v2 regalica/router prompt — the LLM is
    instructed to emit `{"intent": "...", "confidence": ...}`. A legacy
    payload using the old `intent_type` key must NOT be accepted, even
    if its value is a valid intent: that would mask a stale prompt
    rev that still emits the pre-v2 schema.
    """
    legacy_payload = json.dumps({"intent_type": "zoom", "confidence": 0.95})
    llm = _llm_with(legacy_payload)
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_accepts_intent_key_for_canonical_value() -> None:
    """Mirror of the parametrized acceptance test, pinned on the `intent` key."""
    payload = json.dumps({"intent": "citation", "confidence": 0.83})
    llm = _llm_with(payload)
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == "citation"
    assert result.confidence == pytest.approx(0.83)


@pytest.mark.asyncio
async def test_detect_intent_falls_back_on_intent_outside_provided_enum() -> None:
    llm = _llm_with(json.dumps({"intent": "made_up_value", "confidence": 0.99}))
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_falls_back_on_llm_exception() -> None:
    llm = _llm_with(RuntimeError("upstream LLM 500"))
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_falls_back_when_payload_is_not_object() -> None:
    llm = _llm_with(json.dumps(["zoom"]))
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == FALLBACK_INTENT


@pytest.mark.asyncio
async def test_detect_intent_handles_non_numeric_confidence() -> None:
    payload = json.dumps({"intent": "zoom", "confidence": "high"})
    llm = _llm_with(payload)
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.intent_type == "zoom"
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_passes_template_as_system_prompt_with_temp_zero() -> None:
    payload = json.dumps({"intent": "general_help", "confidence": 0.5})
    llm = _llm_with(payload)
    await detect_intent(
        message="hello",
        llm_client=llm,
        router_template="[REGALICA_ROUTER_V1]",
        valid_intents=CANONICAL_INTENTS,
    )
    sent_request = llm.complete.call_args.args[0]
    assert sent_request.system_prompt == "[REGALICA_ROUTER_V1]"
    assert sent_request.prompt == "hello"
    assert sent_request.temperature == 0.0
    assert sent_request.thinking_enabled is False


@pytest.mark.asyncio
async def test_detect_intent_treats_empty_reasoning_as_none() -> None:
    payload = json.dumps({"intent": "zoom", "confidence": 0.7, "reasoning": ""})
    llm = _llm_with(payload)
    result = await detect_intent(
        message="x", llm_client=llm, router_template="[T]", valid_intents=CANONICAL_INTENTS
    )
    assert result.reasoning is None


@pytest.mark.asyncio
async def test_detect_intent_respects_caller_supplied_enum_subset() -> None:
    """If the caller passes a smaller enum, only those intents are accepted."""
    payload = json.dumps({"intent": "zoom", "confidence": 0.9})
    llm = _llm_with(payload)
    result = await detect_intent(
        message="x",
        llm_client=llm,
        router_template="[T]",
        valid_intents=frozenset({"general_help"}),  # zoom NOT included
    )
    assert result.intent_type == FALLBACK_INTENT
