"""Contract tests for C13 — orchestrator integration of static_response
short-circuit and JSON-contract specialist runner.

Three blocks:
  - C13-A : _invoke_aggregator skips the LLM call when the prompt row
            carries a static_response, returning it verbatim with
            zero token cost.
  - C13-B : _invoke_specialist (existing) skips the LLM call when the
            prompt row carries a static_response, surfacing it under
            the "static_response" output key.
  - C13-C : _invoke_specialist_json (new) drives the full
            extract_first_json + corrective retry pipeline, raising
            SpecialistParsingError when both passes fail.

All tests use stub LLM clients — no DB, no network, no asyncpg pool.
The PromptMeta fixtures match the production TypedDict exactly so a
future `from app.services.prompt_loader import PromptMeta` change
breaks the tests rather than diverging silently.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

import pytest
from app.exceptions import SpecialistParsingError
from app.llm.base import LLMClient, LLMRequest, LLMResponse
from app.services.intent_grammar import SpecialistBearer
from app.services.orchestrator import (
    _invoke_aggregator,
    _invoke_specialist,
    _invoke_specialist_json,
    _SpecialistContext,
)
from app.services.prompt_loader import PromptMeta

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _meta(
    *,
    template: str = "system prompt",
    static_response: str | None = None,
    output_contract: str = "string",
    temperature: float = 0.5,
    max_tokens: int = 1024,
    thinking_enabled: bool = False,
    target_model: str = "gemini-2.5-flash",
    model_tier: str = "standard",
) -> PromptMeta:
    return PromptMeta(
        template=template,
        temperature=temperature,
        max_tokens=max_tokens,
        thinking_enabled=thinking_enabled,
        target_model=target_model,
        output_contract=output_contract,
        static_response=static_response,
        model_tier=model_tier,
    )


class _ScriptedLLM(LLMClient):
    """Stub LLM client that yields pre-arranged content strings.

    Each `complete()` call consumes the next item from the script. Tracks
    every request received so tests can assert call counts and bodies.
    """

    def __init__(self, script: list[str]) -> None:
        self._script: list[str] = list(script)
        self.requests: list[LLMRequest] = []

    async def complete(self, request: LLMRequest) -> LLMResponse:
        self.requests.append(request)
        if not self._script:
            raise AssertionError("scripted LLM exhausted — unexpected extra call")
        content = self._script.pop(0)
        return LLMResponse(
            content=content,
            thinking_trace=None,
            tokens_input=10,
            tokens_output=10,
            tokens_thinking=0,
            latency_ms=1,
            model_used="stub",
        )

    @property
    def call_count(self) -> int:
        return len(self.requests)


class _NeverCalledLLM(LLMClient):
    """Stub LLM client whose `complete` raises if invoked."""

    async def complete(self, request: LLMRequest) -> LLMResponse:
        raise AssertionError(f"LLM was called when it should not have been: {request!r}")


# ---------------------------------------------------------------------------
# C13-A — _invoke_aggregator static_response short-circuit
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_aggregator_returns_static_response_without_llm_call() -> None:
    canned = "Cette demande sort du périmètre de REGFlow."
    meta = _meta(static_response=canned)
    llm = _NeverCalledLLM()

    result = await _invoke_aggregator(
        message="user message",
        intent="out_of_scope",
        specialist_outcomes=[],
        aggregator_meta=meta,
        llm_client=llm,
    )

    assert result == {
        "response_markdown": canned,
        "tokens_input": 0,
        "tokens_output": 0,
        "tokens_thinking": 0,
    }


@pytest.mark.asyncio
async def test_aggregator_falls_through_to_llm_when_static_response_is_none() -> None:
    meta = _meta(static_response=None, output_contract="string")
    llm = _ScriptedLLM(["Réponse Regalica composée."])

    result = await _invoke_aggregator(
        message="user message",
        intent="zoom",
        specialist_outcomes=[],
        aggregator_meta=meta,
        llm_client=llm,
    )

    assert result["response_markdown"] == "Réponse Regalica composée."
    assert llm.call_count == 1


@pytest.mark.asyncio
async def test_aggregator_falls_through_to_llm_when_static_response_is_empty_string() -> None:
    """Empty / whitespace static_response must NOT trigger the short-circuit."""
    meta = _meta(static_response="   \n\t  ", output_contract="string")
    llm = _ScriptedLLM(["Réponse fallback."])

    result = await _invoke_aggregator(
        message="user message",
        intent="zoom",
        specialist_outcomes=[],
        aggregator_meta=meta,
        llm_client=llm,
    )

    assert result["response_markdown"] == "Réponse fallback."
    assert llm.call_count == 1


# ---------------------------------------------------------------------------
# C13-B — _invoke_specialist static_response short-circuit
# ---------------------------------------------------------------------------


@dataclass
class _StubPool:
    """Minimal pool stand-in. _invoke_specialist only accepts an asyncpg.Pool
    in its type hint but actually never touches it once load_active_prompt is
    monkey-patched to return the test meta directly.
    """


async def _load_active_prompt_returning(meta: PromptMeta | None) -> AsyncIterator[None]:
    """Helper: monkey-patch shape (unused — kept for symmetry)."""
    yield None


@pytest.mark.asyncio
async def test_specialist_returns_static_response_without_llm_call(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    canned = "Réponse canned du specialist."
    meta = _meta(static_response=canned, output_contract="json")

    async def _fake_load(*args: object, **kwargs: object) -> PromptMeta:
        return meta

    monkeypatch.setattr("app.services.orchestrator.load_active_prompt", _fake_load)

    llm = _NeverCalledLLM()
    ctx = _SpecialistContext(
        pool=_StubPool(),  # type: ignore[arg-type]
        tenant_id="00000000-0000-0000-0000-000000000001",
        llm_client=llm,
        fail_context=None,
        rule_context=None,
        current_run_id=None,
    )
    bearer = SpecialistBearer(
        specialist_id="investigator",
        agent_type="investigator",
        function_name="analyze_fail",
    )

    outcome = await _invoke_specialist("investigator", ctx, bearer)

    assert outcome.success is True
    assert outcome.error is None
    assert outcome.bearer_label == "investigator/analyze_fail"
    assert outcome.output == {"static_response": canned}


# ---------------------------------------------------------------------------
# C13-C — _invoke_specialist_json full pipeline
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_specialist_json_returns_parsed_static_response_when_canned_is_json() -> None:
    """When static_response itself is valid JSON, return the parsed dict
    so callers downstream of _invoke_specialist_json get a uniform
    `dict[str, Any]` return shape regardless of the canned-vs-LLM path.
    """
    canned_json = '{"verdict": "amelioration", "delta": 5}'
    meta = _meta(static_response=canned_json, output_contract="json")
    llm = _NeverCalledLLM()

    result = await _invoke_specialist_json(meta, llm, payload={"input": "ignored"})

    assert result == {"verdict": "amelioration", "delta": 5}


@pytest.mark.asyncio
async def test_specialist_json_wraps_non_json_static_response() -> None:
    """When static_response is plain text (not JSON), wrap it under the
    `static_response` key so the caller still has the raw payload.
    """
    canned_text = "Une réponse fixe non-JSON."
    meta = _meta(static_response=canned_text, output_contract="json")
    llm = _NeverCalledLLM()

    result = await _invoke_specialist_json(meta, llm, payload={"input": "ignored"})

    assert result == {"static_response": canned_text}


@pytest.mark.asyncio
async def test_specialist_json_parses_pure_json_first_pass() -> None:
    meta = _meta(output_contract="json")
    llm = _ScriptedLLM(['{"answer": 42}'])

    result = await _invoke_specialist_json(meta, llm, payload={"q": "what"})

    assert result == {"answer": 42}
    assert llm.call_count == 1


@pytest.mark.asyncio
async def test_specialist_json_recovers_dict_from_prose_wrapper() -> None:
    meta = _meta(output_contract="json")
    payload = {"k": "v"}
    llm = _ScriptedLLM(['Voici le JSON : {"verdict": "stable"} fin de message.'])

    result = await _invoke_specialist_json(meta, llm, payload=payload)

    assert result == {"verdict": "stable"}
    assert llm.call_count == 1


@pytest.mark.asyncio
async def test_specialist_json_retries_once_when_first_response_is_unparseable() -> None:
    meta = _meta(output_contract="json")
    llm = _ScriptedLLM(
        [
            "no json here whatsoever",
            '{"recovered": true}',
        ]
    )

    result = await _invoke_specialist_json(meta, llm, payload={"k": "v"})

    assert result == {"recovered": True}
    assert llm.call_count == 2
    # Retry must use temperature=0 + thinking off — the corrective
    # contract requires a deterministic re-emit.
    retry_request = llm.requests[1]
    assert retry_request.temperature == 0.0
    assert retry_request.thinking_enabled is False


@pytest.mark.asyncio
async def test_specialist_json_raises_specialist_parsing_error_on_double_failure() -> None:
    meta = _meta(output_contract="json")
    llm = _ScriptedLLM(
        [
            "first attempt failed",
            "retry also failed",
        ]
    )

    with pytest.raises(SpecialistParsingError):
        await _invoke_specialist_json(meta, llm, payload={"k": "v"})

    assert llm.call_count == 2


def test_specialist_parsing_error_is_importable_from_app_exceptions() -> None:
    """Cross-module import path is part of the contract."""
    from app.exceptions import SpecialistParsingError as Exc

    assert issubclass(Exc, Exception)


# ---------------------------------------------------------------------------
# C13-D — PromptMeta + load_active_prompt extension
# ---------------------------------------------------------------------------


def test_prompt_meta_carries_static_response_and_model_tier_keys() -> None:
    """The TypedDict must accept both new keys without raising at construction
    time. mypy enforces the type at the static layer; this test catches
    accidental key removal at runtime.
    """
    meta = PromptMeta(
        template="t",
        temperature=0.0,
        max_tokens=1,
        thinking_enabled=False,
        target_model="m",
        output_contract="json",
        static_response=None,
        model_tier="lite",
    )
    assert meta["static_response"] is None
    assert meta["model_tier"] == "lite"


def test_prompt_meta_accepts_non_null_static_response() -> None:
    meta = PromptMeta(
        template="t",
        temperature=0.0,
        max_tokens=1,
        thinking_enabled=False,
        target_model="m",
        output_contract="string",
        static_response="canned text",
        model_tier="standard",
    )
    assert meta["static_response"] == "canned text"
