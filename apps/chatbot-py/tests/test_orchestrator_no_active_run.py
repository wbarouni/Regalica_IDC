"""Unit tests for the no-active-run short-circuit (Cas N°1, 2026-05-11).

Covers the orchestrator branch that intercepts intents flagged
`requires_active_run = TRUE` in the intent grammar when the caller
passes no `current_run_id`. The branch loads
`regalica/aggregate_no_active_run` (migration 114), surfaces its
static_response verbatim, and skips the specialists + aggregator
pipeline entirely.

Doctrine: the constant set previously held in
`_INTENTS_NEEDING_FAILS` is now DB-driven (migration 113). These
tests verify both the new dispatch behaviour AND the fall-through
safeguard (when the no-run prompt is missing, the orchestrator
degrades to the legacy hallucination-prone path instead of throwing).
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
from app.services.orchestrator import OrchestratorResult, orchestrate

_TENANT = "00000000-0000-0000-0000-000000000001"

_STATIC_NO_RUN_RESPONSE = (
    "Pour vous répondre, j'ai besoin d'une validation BCT active. "
    "Veuillez déposer vos rapports réglementaires (fichiers XML BCT) "
    "via la zone de dépôt."
)


@pytest.fixture(autouse=True)
def _seed_intent_grammar_cache() -> Iterator[None]:
    """Match the migration 065+113 seed: zoom + plan flipped to TRUE."""
    ig.reset_intent_grammar_cache()
    pc.reset_platform_config_cache()
    pc._CACHE["regalica_planner_trigger_intents"] = []
    pc._CACHE["regalica_planner_max_plan_steps"] = 4
    pc._CACHE["regalica_router_max_tokens"] = 1024
    pc._CACHE["regalica_thinking_preview_max_chars"] = 180
    ig._CACHE = ig.IntentGrammar(
        intents={
            "zoom": ig.IntentSpec(
                intent_type="zoom",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_zoom_fail",
                specialist_ids=("investigator", "citation"),
                ordinal=1,
                requires_active_run=True,
            ),
            "plan": ig.IntentSpec(
                intent_type="plan",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_plan_optimal",
                specialist_ids=("investigator", "historical"),
                ordinal=7,
                requires_active_run=True,
            ),
            "general_help": ig.IntentSpec(
                intent_type="general_help",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_general_help",
                specialist_ids=(),
                ordinal=8,
                # Stays False — general_help can be answered without a run.
            ),
            "launch_validation": ig.IntentSpec(
                intent_type="launch_validation",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_t1_result",
                specialist_ids=("t1_runner",),
                ordinal=11,
                requires_run_uniqueness=True,
                # Stays False — launch_validation CREATES the run.
            ),
        },
        bearers={
            "investigator": ig.SpecialistBearer(
                specialist_id="investigator",
                agent_type="investigator",
                function_name="analyze_fail",
            ),
            "citation": ig.SpecialistBearer(
                specialist_id="citation",
                agent_type="citation",
                function_name="find_regulatory_source",
            ),
            "historical": ig.SpecialistBearer(
                specialist_id="historical",
                agent_type="historical",
                function_name="compare_runs_history",
            ),
            "t1_runner": ig.SpecialistBearer(
                specialist_id="t1_runner",
                agent_type="regalica",
                function_name="aggregate_t1_result",
            ),
        },
    )
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


def _prompt_row(template: str = "[TEMPLATE]", static_response: str | None = None) -> dict[str, Any]:
    return {
        "template": template,
        "temperature": 0.0,
        "max_tokens": 256,
        "thinking_enabled": False,
        "target_model": "gemini-2.5-flash",
        "output_contract": "string",
        "static_response": static_response,
        "model_tier": "standard",
    }


def _build_pool(prompts: dict[tuple[str, str], dict[str, Any] | None]) -> MagicMock:
    async def fake_fetchrow(query: str, *args: Any) -> dict[str, Any] | None:
        if "FROM prompt_bank" in query:
            agent_type = args[1] if len(args) > 1 else None
            function_name = args[2] if len(args) > 2 else None
            return prompts.get((agent_type, function_name))
        return None

    async def fake_fetch(query: str, *args: Any) -> list[dict[str, Any]]:
        del query, args
        return []

    pool = MagicMock()
    pool.fetchrow = AsyncMock(side_effect=fake_fetchrow)
    pool.fetch = AsyncMock(side_effect=fake_fetch)
    return pool


def _build_llm(responses: list[LLMResponse]) -> MagicMock:
    client = MagicMock()
    client.complete = AsyncMock(side_effect=list(responses))
    return client


@pytest.mark.asyncio
async def test_zoom_intent_without_run_short_circuits_with_static_response() -> None:
    """zoom + current_run_id=None → static no-active-run response, no specialists called."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[ROUTER]"),
        ("regalica", "aggregate_no_active_run"): _prompt_row(
            "[NO_RUN_TEMPLATE]",
            static_response=_STATIC_NO_RUN_RESPONSE,
        ),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            # Only the router LLM is called. The aggregator short-
            # circuits on static_response — zero specialist / zero
            # aggregator LLM call.
            _llm_response(json.dumps({"intent": "zoom", "confidence": 0.95})),
        ]
    )
    result: OrchestratorResult = await orchestrate(
        message="bonjour merci de vérifier les résultats",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id=None,
    )
    assert isinstance(result, OrchestratorResult)
    assert result.response_markdown == _STATIC_NO_RUN_RESPONSE
    assert result.agents_called == ["regalica/aggregate_no_active_run"]
    # Token counters report zero — the static_response path bypasses
    # the LLM entirely. Only the router call burned tokens upstream;
    # those are NOT carried into the OrchestratorResult by the
    # aggregator branch (token totals reflect aggregator activity only).
    assert result.tokens_input == 0
    assert result.tokens_output == 0
    assert result.tokens_thinking == 0
    # Router was called exactly once; no specialist / aggregator LLM call.
    assert llm.complete.await_count == 1


@pytest.mark.asyncio
async def test_plan_intent_without_run_short_circuits_with_static_response() -> None:
    """plan + current_run_id=None → same short-circuit (DB-driven flag)."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[ROUTER]"),
        ("regalica", "aggregate_no_active_run"): _prompt_row(
            "[NO_RUN_TEMPLATE]",
            static_response=_STATIC_NO_RUN_RESPONSE,
        ),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "plan", "confidence": 0.85})),
        ]
    )
    result = await orchestrate(
        message="propose un plan de correction",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id=None,
    )
    assert result.response_markdown == _STATIC_NO_RUN_RESPONSE
    assert result.agents_called == ["regalica/aggregate_no_active_run"]
    assert llm.complete.await_count == 1


@pytest.mark.asyncio
async def test_general_help_intent_without_run_does_not_short_circuit() -> None:
    """general_help has requires_active_run=False → normal aggregator path."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[ROUTER]"),
        ("regalica", "aggregate_general_help"): _prompt_row("[HELP_TEMPLATE]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.9})),
            _llm_response("Voici l'aide générale demandée."),
        ]
    )
    result = await orchestrate(
        message="à quoi sert Regalica ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id=None,
    )
    assert result.response_markdown == "Voici l'aide générale demandée."
    assert result.agents_called == ["regalica/aggregate_general_help"]
    # 1 router + 1 aggregator = 2 LLM calls. No short-circuit fired.
    assert llm.complete.await_count == 2


@pytest.mark.asyncio
async def test_zoom_intent_falls_through_when_no_run_prompt_missing() -> None:
    """When migration 114 has not run, the short-circuit logs and falls
    through to the legacy path so the chat never throws. The legacy
    path will still hallucinate or refuse — but Cas N°1's contract
    is degradation, not regression: a missing prompt MUST NOT 500 the
    chat route.
    """
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[ROUTER]"),
        # Intentionally omit ("regalica", "aggregate_no_active_run").
        ("regalica", "aggregate_zoom_fail"): _prompt_row("[ZOOM]"),
        ("investigator", "analyze_fail"): _prompt_row("[INV]"),
        ("citation", "find_regulatory_source"): _prompt_row("[CIT]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "zoom", "confidence": 0.9})),
            # Specialists run as if Cas N°1 fix were absent.
            _llm_response("investigator output"),
            _llm_response("citation output"),
            # Aggregator composes the (likely degraded) final response.
            _llm_response("Fallback response without run context."),
        ]
    )
    result = await orchestrate(
        message="zoom sur la rubrique 5",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id=None,
    )
    assert isinstance(result, OrchestratorResult)
    assert "Fallback response" in result.response_markdown
    # The aggregator label is the legacy `aggregate_zoom_fail`, NOT
    # `aggregate_no_active_run` — confirming the fall-through path
    # was taken instead of the short-circuit.
    assert "regalica/aggregate_zoom_fail" in result.agents_called


@pytest.mark.asyncio
async def test_zoom_intent_with_run_does_not_short_circuit() -> None:
    """current_run_id is set → no short-circuit, specialists run normally."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[ROUTER]"),
        ("regalica", "aggregate_zoom_fail"): _prompt_row("[ZOOM]"),
        ("investigator", "analyze_fail"): _prompt_row("[INV]"),
        ("citation", "find_regulatory_source"): _prompt_row("[CIT]"),
        # The no-run prompt IS active here — but the short-circuit
        # must not fire because current_run_id is present.
        ("regalica", "aggregate_no_active_run"): _prompt_row(
            "[NO_RUN]",
            static_response="should_not_appear",
        ),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "zoom", "confidence": 0.95})),
            _llm_response(json.dumps({"hypothesis": "ok"})),
            _llm_response(json.dumps({"source": "BCT 2017-06"})),
            _llm_response("Réponse zoom complète."),
        ]
    )
    result = await orchestrate(
        message="zoom sur la rubrique 5",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id="00000000-0000-0000-0000-000000000fff",
    )
    assert "Réponse zoom complète." in result.response_markdown
    assert "should_not_appear" not in result.response_markdown
    assert "regalica/aggregate_zoom_fail" in result.agents_called
