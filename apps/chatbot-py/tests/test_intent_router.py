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
from app.services.intent_router import DIRECT_INTENT, detect_intent


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


@pytest.mark.asyncio
async def test_detect_intent_returns_label_emitted_by_llm() -> None:
    llm = _llm_with(json.dumps({"intent": "investigator"}))
    intent = await detect_intent(
        message="Pourquoi la règle 139/r3 a-t-elle échoué ?",
        llm_client=llm,
        router_template="[REGALICA_ROUTER_V1]",
    )
    assert intent == "investigator"


@pytest.mark.asyncio
async def test_detect_intent_supports_each_canonical_label() -> None:
    for label in ("citation", "historical", "direct"):
        llm = _llm_with(json.dumps({"intent": label}))
        intent = await detect_intent(
            message="anything",
            llm_client=llm,
            router_template="[REGALICA_ROUTER_V1]",
        )
        assert intent == label


@pytest.mark.asyncio
async def test_detect_intent_falls_back_to_direct_on_invalid_json() -> None:
    llm = _llm_with("not a json blob at all")
    intent = await detect_intent(
        message="anything",
        llm_client=llm,
        router_template="[REGALICA_ROUTER_V1]",
    )
    assert intent == DIRECT_INTENT


@pytest.mark.asyncio
async def test_detect_intent_falls_back_to_direct_on_missing_key() -> None:
    llm = _llm_with(json.dumps({"unrelated": "value"}))
    intent = await detect_intent(
        message="anything",
        llm_client=llm,
        router_template="[REGALICA_ROUTER_V1]",
    )
    assert intent == DIRECT_INTENT


@pytest.mark.asyncio
async def test_detect_intent_falls_back_to_direct_on_llm_exception() -> None:
    llm = _llm_with(RuntimeError("upstream LLM 500"))
    intent = await detect_intent(
        message="anything",
        llm_client=llm,
        router_template="[REGALICA_ROUTER_V1]",
    )
    assert intent == DIRECT_INTENT


@pytest.mark.asyncio
async def test_detect_intent_passes_template_as_system_prompt() -> None:
    llm = _llm_with(json.dumps({"intent": "direct"}))
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
