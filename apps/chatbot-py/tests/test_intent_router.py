"""Unit tests for `app.services.intent_router.detect_intent`.

Pure in-process: no network, no DB. The LLM client is replaced
with an `AsyncMock` whose `complete` method returns canned
`LLMResponse` payloads.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.services.intent_router import (
    FALLBACK_INTENT,
    VALID_INTENTS,
    IntentResult,
    detect_intent,
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


@pytest.mark.parametrize("label", sorted(VALID_INTENTS))
@pytest.mark.asyncio
async def test_detect_intent_accepts_each_valid_enum_value(label: str) -> None:
    """The 10 Doc 10 §3 enum values are all parsed verbatim."""
    payload = json.dumps({"intent_type": label, "confidence": 0.92})
    llm = _llm_with(payload)
    result = await detect_intent(
        message="anything",
        llm_client=llm,
        router_template="[REGALICA_ROUTER_V1]",
    )
    assert isinstance(result, IntentResult)
    assert result.intent_type == label
    assert result.confidence == pytest.approx(0.92)
    assert result.reasoning is None


@pytest.mark.asyncio
async def test_detect_intent_extracts_confidence_as_float() -> None:
    payload = json.dumps({"intent_type": "zoom_fail", "confidence": 1})
    llm = _llm_with(payload)
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert isinstance(result.confidence, float)
    assert result.confidence == 1.0


@pytest.mark.asyncio
async def test_detect_intent_extracts_optional_reasoning() -> None:
    payload = json.dumps(
        {
            "intent_type": "grappe_cause_racine",
            "confidence": 0.81,
            "reasoning": "FAILs successifs sur la même annexe",
        }
    )
    llm = _llm_with(payload)
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert result.intent_type == "grappe_cause_racine"
    assert result.reasoning == "FAILs successifs sur la même annexe"


@pytest.mark.asyncio
async def test_detect_intent_falls_back_on_invalid_json() -> None:
    llm = _llm_with("not a json blob at all")
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0
    assert result.reasoning is None


@pytest.mark.asyncio
async def test_detect_intent_falls_back_when_intent_type_missing() -> None:
    llm = _llm_with(json.dumps({"confidence": 0.99}))
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_falls_back_on_intent_outside_enum() -> None:
    llm = _llm_with(json.dumps({"intent_type": "made_up_value", "confidence": 0.99}))
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_falls_back_on_llm_exception() -> None:
    llm = _llm_with(RuntimeError("upstream LLM 500"))
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert result.intent_type == FALLBACK_INTENT
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_falls_back_when_payload_is_not_object() -> None:
    llm = _llm_with(json.dumps(["zoom_fail"]))
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert result.intent_type == FALLBACK_INTENT


@pytest.mark.asyncio
async def test_detect_intent_handles_non_numeric_confidence() -> None:
    payload = json.dumps({"intent_type": "zoom_fail", "confidence": "high"})
    llm = _llm_with(payload)
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert result.intent_type == "zoom_fail"
    assert result.confidence == 0.0


@pytest.mark.asyncio
async def test_detect_intent_passes_template_as_system_prompt_with_temp_zero() -> None:
    payload = json.dumps({"intent_type": "general_help", "confidence": 0.5})
    llm = _llm_with(payload)
    await detect_intent(
        message="hello",
        llm_client=llm,
        router_template="[REGALICA_ROUTER_V1]",
    )
    sent_request = llm.complete.call_args.args[0]
    assert sent_request.system_prompt == "[REGALICA_ROUTER_V1]"
    assert sent_request.prompt == "hello"
    assert sent_request.temperature == 0.0
    assert sent_request.thinking_enabled is False


@pytest.mark.asyncio
async def test_detect_intent_treats_empty_reasoning_as_none() -> None:
    payload = json.dumps({"intent_type": "zoom_fail", "confidence": 0.7, "reasoning": ""})
    llm = _llm_with(payload)
    result = await detect_intent(message="x", llm_client=llm, router_template="[T]")
    assert result.reasoning is None
