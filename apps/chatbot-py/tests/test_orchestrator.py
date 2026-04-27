"""Unit tests for `app.services.orchestrator.orchestrate`.

Mocks: pool.fetchrow / pool.fetch are AsyncMock; LLMClient.complete
is AsyncMock returning canned LLMResponse. No network, no DB.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.services.orchestrator import OrchestratorResult, orchestrate


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
        "temperature": 0.3,
        "max_tokens": 4096,
        "thinking_enabled": False,
        "target_model": "gemini-2.5-flash",
    }


def _build_pool(prompt_rows: list[dict[str, Any] | None]) -> MagicMock:
    """Mock pool whose `fetchrow` returns the given rows in order."""
    pool = MagicMock()
    pool.fetchrow = AsyncMock(side_effect=list(prompt_rows))
    pool.fetch = AsyncMock(return_value=[])
    return pool


def _build_llm(responses: list[LLMResponse]) -> MagicMock:
    client = MagicMock()
    client.complete = AsyncMock(side_effect=list(responses))
    return client


_TENANT = "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_orchestrate_dispatches_investigator_when_router_says_so() -> None:
    pool = _build_pool(
        [
            _prompt_row("[REGALICA_ROUTER_V1]"),
            _prompt_row("[INVESTIGATOR_ANALYZE_FAIL_V1]"),
        ]
    )
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "investigator"})),
            _llm_response(json.dumps({"response_markdown": "Cause racine identifiée."})),
        ]
    )
    result: OrchestratorResult = await orchestrate(
        message="Pourquoi la règle 139/r3 a-t-elle échoué ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        fail_context={"annexeCode": "139", "numRegle": 3},
        rule_context={"axTerm": "139", "numRegle": 3},
    )
    assert result.agents_called == ["investigator/analyze_fail"]
    assert "Cause racine identifiée" in result.response_markdown
    assert "investigator" in result.thinking_trace


@pytest.mark.asyncio
async def test_orchestrate_dispatches_citation_when_router_says_so() -> None:
    pool = _build_pool(
        [
            _prompt_row("[REGALICA_ROUTER_V1]"),
            _prompt_row("[CITATION_FIND_REGULATORY_SOURCE_V1]"),
        ]
    )
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "citation"})),
            _llm_response(json.dumps({"response_markdown": "Voir circulaire 2018-06."})),
        ]
    )
    result = await orchestrate(
        message="Quelle est la source réglementaire ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        rule_context={"axTerm": "47", "numRegle": 12},
    )
    assert result.agents_called == ["citation/find_regulatory_source"]
    assert "circulaire 2018-06" in result.response_markdown


@pytest.mark.asyncio
async def test_orchestrate_dispatches_historical_when_router_says_so() -> None:
    pool = _build_pool(
        [
            _prompt_row("[REGALICA_ROUTER_V1]"),
            _prompt_row("[HISTORICAL_COMPARE_RUNS_HISTORY_V1]"),
        ]
    )
    # HistoricalAgent will call pool.fetch internally; default is [] so the
    # agent returns a stable fallback without a second LLM call.
    llm = _build_llm([_llm_response(json.dumps({"intent": "historical"}))])
    result = await orchestrate(
        message="Quelle est la tendance par rapport au trimestre précédent ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id="33333333-3333-3333-3333-333333333333",
    )
    assert result.agents_called == ["historical/compare_runs_history"]
    # No previous runs in the mock -> agent returns the stable narrative.
    assert "stable" in result.response_markdown or "Aucun run" in result.response_markdown


@pytest.mark.asyncio
async def test_orchestrate_falls_back_to_direct_when_router_says_direct() -> None:
    pool = _build_pool(
        [
            _prompt_row("[REGALICA_ROUTER_V1]"),
            _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
        ]
    )
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "direct"})),
            _llm_response("Bonjour, je suis Regalica."),
        ]
    )
    result = await orchestrate(
        message="Bonjour, qui êtes-vous ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    assert result.agents_called == ["regalica/aggregate_general_help"]
    assert result.response_markdown == "Bonjour, je suis Regalica."


@pytest.mark.asyncio
async def test_orchestrate_returns_fallback_when_router_prompt_inactive() -> None:
    pool = _build_pool([None])  # load_active_prompt returns None
    llm = _build_llm([])
    result = await orchestrate(
        message="anything",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    assert result.agents_called == []
    assert "Aucun prompt actif" in result.response_markdown
    assert "regalica/router" in result.response_markdown
    llm.complete.assert_not_awaited()


@pytest.mark.asyncio
async def test_orchestrate_returns_fallback_when_specialist_prompt_inactive() -> None:
    pool = _build_pool(
        [
            _prompt_row("[REGALICA_ROUTER_V1]"),
            None,  # specialist prompt missing
        ]
    )
    llm = _build_llm([_llm_response(json.dumps({"intent": "investigator"}))])
    result = await orchestrate(
        message="Pourquoi ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    assert result.agents_called == ["investigator/analyze_fail"]
    assert "Aucun prompt actif" in result.response_markdown
    assert "investigator/analyze_fail" in result.response_markdown


@pytest.mark.asyncio
async def test_orchestrate_thinking_trace_follows_persona_template() -> None:
    pool = _build_pool(
        [
            _prompt_row("[REGALICA_ROUTER_V1]"),
            _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
        ]
    )
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "direct"})),
            _llm_response("OK."),
        ]
    )
    result = await orchestrate(
        message="Test message",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    assert result.thinking_trace.startswith("L'utilisateur demande")
    assert "mais je pense" in result.thinking_trace
    assert "donc je vais" in result.thinking_trace
    assert "Test message" in result.thinking_trace
    assert "direct" in result.thinking_trace


@pytest.mark.asyncio
async def test_orchestrate_unknown_intent_falls_back_to_direct() -> None:
    pool = _build_pool(
        [
            _prompt_row("[REGALICA_ROUTER_V1]"),
            _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
        ]
    )
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "made_up_intent_xyz"})),
            _llm_response("Direct response."),
        ]
    )
    result = await orchestrate(
        message="anything",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    assert result.agents_called == ["regalica/aggregate_general_help"]
    assert "made_up_intent_xyz" in result.thinking_trace
