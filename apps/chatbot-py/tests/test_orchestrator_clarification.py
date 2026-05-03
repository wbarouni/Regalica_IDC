"""Wiring tests for the clarification_reason payload tag in orchestrate.

The regalica/aggregate_ambiguous prompt is invoked from two distinct
places in the pipeline:

  router-direct  the router LLM emits {"intent": "ambiguous"} because
                 confidence was too low to classify the user's message;
  planner-clar   the planner returns plan_type="clarification" and the
                 orchestrator switches the active intent to "ambiguous".

Both paths converge on _invoke_aggregator. The orchestrator must tag
the JSON payload with the right `clarification_reason` so the prompt
template can branch on Phrase 1 wording. The constants live in
app.services.clarification — Guard D-004 forbids the literal strings
anywhere else in source.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.services import clarification as _clarification
from app.services import intent_grammar as ig
from app.services import platform_config as pc
from app.services.orchestrator import orchestrate

_TENANT = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _seed_caches() -> Iterator[None]:
    ig.reset_intent_grammar_cache()
    pc.reset_platform_config_cache()
    ig._CACHE = ig.IntentGrammar(
        intents={
            "simulation": ig.IntentSpec(
                intent_type="simulation",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_simulation_impact",
                specialist_ids=("investigator",),
                ordinal=5,
            ),
            "general_help": ig.IntentSpec(
                intent_type="general_help",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_general_help",
                specialist_ids=(),
                ordinal=8,
            ),
            "ambiguous": ig.IntentSpec(
                intent_type="ambiguous",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_ambiguous",
                specialist_ids=(),
                ordinal=10,
            ),
        },
        bearers={
            "investigator": ig.SpecialistBearer(
                specialist_id="investigator",
                agent_type="investigator",
                function_name="analyze_fail",
            ),
        },
    )
    pc._CACHE["regalica_planner_trigger_intents"] = ["simulation"]
    pc._CACHE["regalica_planner_max_plan_steps"] = 4
    yield
    ig.reset_intent_grammar_cache()
    pc.reset_platform_config_cache()


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


def _prompt_row(template: str = "[TEMPLATE]") -> dict[str, Any]:
    return {
        "template": template,
        "temperature": 0.5,
        "max_tokens": 256,
        "thinking_enabled": False,
        "target_model": "gemini-2.5-flash",
        "output_contract": "string",
        "static_response": None,
        "model_tier": "standard",
    }


def _build_pool(
    prompts: dict[tuple[str, str], dict[str, Any] | None],
) -> MagicMock:
    prompt_table = prompts

    async def fake_fetchrow(query: str, *args: Any) -> dict[str, Any] | None:
        if "FROM prompt_bank" in query:
            agent_type = args[1] if len(args) > 1 else None
            function_name = args[2] if len(args) > 2 else None
            return prompt_table.get((agent_type, function_name))
        if "FROM validation_runs" in query:
            return None
        return None

    async def fake_fetch(query: str, *args: Any) -> list[dict[str, Any]]:
        return []

    pool = MagicMock()
    pool.fetchrow = AsyncMock(side_effect=fake_fetchrow)
    pool.fetch = AsyncMock(side_effect=fake_fetch)
    return pool


def _capturing_llm(responses: list[LLMResponse]) -> tuple[MagicMock, list[Any]]:
    """LLM mock that records every LLMRequest passed to complete()."""
    captured_requests: list[Any] = []
    response_iter = iter(responses)

    async def _complete(request: Any) -> LLMResponse:
        captured_requests.append(request)
        try:
            return next(response_iter)
        except StopIteration as exc:
            raise AssertionError("LLM mock exhausted") from exc

    client = MagicMock()
    client.complete = AsyncMock(side_effect=_complete)
    return client, captured_requests


def _aggregator_payload(captured_requests: list[Any], aggregator_template: str) -> dict[str, Any]:
    """Find the LLM call whose system_prompt is the aggregator template
    and return its parsed JSON user prompt.
    """
    for request in captured_requests:
        if request.system_prompt == aggregator_template:
            return json.loads(request.prompt)
    raise AssertionError(f"no aggregator call found for template {aggregator_template!r}")


# ---------------------------------------------------------------------------
# Path A — router emits "ambiguous" directly
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_router_direct_ambiguous_tags_payload_with_router_low_confidence() -> None:
    """When the router LLM returns intent="ambiguous", the aggregator
    payload must carry clarification_reason="router_low_confidence".
    """
    aggregator_template = "[AMBIGUOUS_TEMPLATE_ROUTER_PATH]"
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[ROUTER_TEMPLATE]"),
        ("regalica", "aggregate_ambiguous"): _prompt_row(aggregator_template),
    }
    pool = _build_pool(prompts)
    llm, captured = _capturing_llm(
        [
            # Router classifies as ambiguous (low confidence direct path).
            _llm_response(json.dumps({"intent": "ambiguous", "confidence": 0.42})),
            # Aggregator response (markdown).
            _llm_response("Pourriez-vous préciser votre question ?"),
        ]
    )

    await orchestrate(
        message="pourquoi",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )

    payload = _aggregator_payload(captured, aggregator_template)
    assert payload["intent_type"] == "ambiguous"
    assert payload["clarification_reason"] == _clarification.ROUTER_LOW_CONFIDENCE
    assert payload["specialist_outputs"] == []


# ---------------------------------------------------------------------------
# Path B — planner returns plan_type="clarification"
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_planner_clarification_tags_payload_with_planner_clarification() -> None:
    """When the planner returns plan_type="clarification" on a triggered
    intent, the orchestrator switches to ambiguous AND tags the payload
    with clarification_reason="planner_clarification".
    """
    aggregator_template = "[AMBIGUOUS_TEMPLATE_PLANNER_PATH]"
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[ROUTER_TEMPLATE]"),
        ("regalica", "planner"): _prompt_row("[PLANNER_TEMPLATE]"),
        ("regalica", "aggregate_ambiguous"): _prompt_row(aggregator_template),
    }
    pool = _build_pool(prompts)
    llm, captured = _capturing_llm(
        [
            # Router classifies as simulation (triggered intent) with high conf.
            _llm_response(json.dumps({"intent": "simulation", "confidence": 0.92})),
            # Planner returns clarification — orchestrator switches to ambiguous.
            _llm_response(json.dumps({"plan_type": "clarification", "steps": []})),
            # Aggregator response.
            _llm_response(
                "Pour traiter votre demande, j'aurais besoin d'une précision supplémentaire."
            ),
        ]
    )

    await orchestrate(
        message="je veux corriger quelque chose",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )

    payload = _aggregator_payload(captured, aggregator_template)
    assert payload["intent_type"] == "ambiguous"
    assert payload["clarification_reason"] == _clarification.PLANNER_CLARIFICATION
    assert payload["specialist_outputs"] == []


# ---------------------------------------------------------------------------
# Path C — non-ambiguous intent must NOT carry clarification_reason
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_ambiguous_intent_omits_clarification_reason_field() -> None:
    """When the active intent is anything other than ambiguous, the
    aggregator payload must NOT carry the clarification_reason key —
    other prompts have no schema slot for it and adding it would
    pollute their input contract.
    """
    aggregator_template = "[GENERAL_HELP_TEMPLATE]"
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[ROUTER_TEMPLATE]"),
        ("regalica", "aggregate_general_help"): _prompt_row(aggregator_template),
    }
    pool = _build_pool(prompts)
    llm, captured = _capturing_llm(
        [
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.85})),
            _llm_response("Bonjour, je suis Regalica."),
        ]
    )

    await orchestrate(
        message="qui êtes-vous ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )

    payload = _aggregator_payload(captured, aggregator_template)
    assert payload["intent_type"] == "general_help"
    assert "clarification_reason" not in payload


# ---------------------------------------------------------------------------
# Path D — clarification_reason values come from the constants module
# ---------------------------------------------------------------------------


def test_clarification_constants_have_canonical_values() -> None:
    """The two constants must hold the exact strings the seed enum
    declares — Guard against drift.
    """
    assert _clarification.ROUTER_LOW_CONFIDENCE == "router_low_confidence"
    assert _clarification.PLANNER_CLARIFICATION == "planner_clarification"
