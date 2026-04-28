"""Unit tests for `app.services.orchestrator.orchestrate`.

Mocks: pool.fetchrow / pool.fetch are AsyncMock; LLMClient.complete
is AsyncMock returning canned LLMResponse. No network, no DB.

The pool fixture matches prompt_bank rows by (agent_type,
function_name) instead of relying on call order, because the
orchestrator now launches the aggregator-prompt fetch and the
specialist-prompt fetches concurrently via asyncio.gather.
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


def _build_pool(
    prompts: dict[tuple[str, str], dict[str, Any] | None] | None = None,
) -> MagicMock:
    """Mock pool whose fetchrow returns prompt rows by (agent_type, function_name)."""
    table = prompts or {}

    async def fake_fetchrow(query: str, *args: Any) -> dict[str, Any] | None:
        # load_active_prompt passes (tenant_id, agent_type, function_name).
        if "FROM prompt_bank" in query:
            agent_type = args[1] if len(args) > 1 else None
            function_name = args[2] if len(args) > 2 else None
            return table.get((agent_type, function_name))
        return None

    pool = MagicMock()
    pool.fetchrow = AsyncMock(side_effect=fake_fetchrow)
    pool.fetch = AsyncMock(return_value=[])
    return pool


def _build_llm(responses: list[LLMResponse]) -> MagicMock:
    client = MagicMock()
    client.complete = AsyncMock(side_effect=list(responses))
    return client


_TENANT = "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_orchestrate_zoom_fail_invokes_investigator_and_citation_then_aggregator() -> None:
    """zoom_fail intent → Investigator + Citation in parallel, then aggregator."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_zoom_fail"): _prompt_row("[REGALICA_AGGREGATE_ZOOM_FAIL_V1]"),
        ("investigator", "analyze_fail"): _prompt_row("[INVESTIGATOR_ANALYZE_FAIL_V1]"),
        ("citation", "find_regulatory_source"): _prompt_row("[CITATION_FIND_REGULATORY_SOURCE_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            # Router classifies as zoom_fail.
            _llm_response(json.dumps({"intent_type": "zoom_fail", "confidence": 0.95})),
            # Investigator + Citation each emit JSON; order undefined.
            _llm_response(json.dumps({"cause_racine": "annexe 139 vide"})),
            _llm_response(json.dumps({"circulaire": "BCT 2018-06"})),
            # Aggregator composes the user-facing markdown.
            _llm_response("Diagnostic complet : annexe 139 vide, voir circulaire."),
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
    assert result.agents_called == [
        "investigator/analyze_fail",
        "citation/find_regulatory_source",
        "regalica/aggregate_zoom_fail",
    ]
    assert "annexe 139 vide" in result.response_markdown
    assert "zoom_fail" in result.thinking_trace
    assert "investigator" in result.thinking_trace
    assert "citation" in result.thinking_trace
    # 1 router + 2 specialists + 1 aggregator = 4 LLM calls.
    assert llm.complete.await_count == 4


@pytest.mark.asyncio
async def test_orchestrate_citation_reglementaire_invokes_only_citation_and_aggregator() -> None:
    """citation_reglementaire → 1 specialist + aggregator."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_citation_reglementaire"): _prompt_row(
            "[REGALICA_AGGREGATE_CITATION_REGLEMENTAIRE_V1]"
        ),
        ("citation", "find_regulatory_source"): _prompt_row("[CITATION_FIND_REGULATORY_SOURCE_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(
                json.dumps({"intent_type": "citation_reglementaire", "confidence": 0.92})
            ),
            _llm_response(json.dumps({"circulaire": "BCT 2018-06", "article": "7"})),
            _llm_response("Voir circulaire BCT 2018-06 article 7."),
        ]
    )
    result = await orchestrate(
        message="Quelle est la source réglementaire ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        rule_context={"axTerm": "47", "numRegle": 12},
    )
    assert result.agents_called == [
        "citation/find_regulatory_source",
        "regalica/aggregate_citation_reglementaire",
    ]
    assert "circulaire BCT 2018-06" in result.response_markdown


@pytest.mark.asyncio
async def test_orchestrate_historique_recurrence_invokes_historical_and_aggregator() -> None:
    """historique_recurrence → Historical + aggregator. No previous run -> stable fallback inside agent."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_historique_recurrence"): _prompt_row(
            "[REGALICA_AGGREGATE_HISTORIQUE_RECURRENCE_V1]"
        ),
        ("historical", "compare_runs_history"): _prompt_row("[HISTORICAL_COMPARE_RUNS_HISTORY_V1]"),
    }
    pool = _build_pool(prompts)
    # HistoricalAgent fetches previous runs via pool.fetch, returns
    # stable fallback when empty (no LLM call inside the agent).
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent_type": "historique_recurrence", "confidence": 0.88})),
            # Aggregator only — Historical does not call LLM in this case.
            _llm_response("Tendance stable, pas de run précédent."),
        ]
    )
    result = await orchestrate(
        message="Quelle est la tendance par rapport au trimestre précédent ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id="33333333-3333-3333-3333-333333333333",
    )
    assert result.agents_called == [
        "historical/compare_runs_history",
        "regalica/aggregate_historique_recurrence",
    ]
    assert "stable" in result.response_markdown


@pytest.mark.asyncio
async def test_orchestrate_plan_optimal_invokes_investigator_and_historical_in_parallel() -> None:
    """plan_optimal → Investigator + Historical parallel, then aggregator."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_plan_optimal"): _prompt_row("[REGALICA_AGGREGATE_PLAN_OPTIMAL_V1]"),
        ("investigator", "analyze_fail"): _prompt_row("[INVESTIGATOR_ANALYZE_FAIL_V1]"),
        ("historical", "compare_runs_history"): _prompt_row("[HISTORICAL_COMPARE_RUNS_HISTORY_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent_type": "plan_optimal", "confidence": 0.85})),
            _llm_response(json.dumps({"cause_racine": "x"})),  # Investigator
            _llm_response("Plan recommandé : corriger l'annexe 47."),  # Aggregator
            # Historical does not call LLM since pool.fetch returns [] -> stable fallback.
        ]
    )
    result = await orchestrate(
        message="Quel est le plan optimal de correction ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id="33333333-3333-3333-3333-333333333333",
    )
    assert "investigator/analyze_fail" in result.agents_called
    assert "historical/compare_runs_history" in result.agents_called
    assert result.agents_called[-1] == "regalica/aggregate_plan_optimal"
    assert "Plan recommandé" in result.response_markdown


@pytest.mark.asyncio
async def test_orchestrate_general_help_skips_specialists_and_calls_aggregator_only() -> None:
    """general_help has no specialists; aggregator runs alone."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_general_help"): _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent_type": "general_help", "confidence": 0.7})),
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
    # 1 router + 1 aggregator only.
    assert llm.complete.await_count == 2


@pytest.mark.asyncio
async def test_orchestrate_returns_fallback_when_router_prompt_inactive() -> None:
    """No active router prompt → orchestrator emits the fallback message."""
    pool = _build_pool({})  # nothing in prompt_bank
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
async def test_orchestrate_returns_fallback_when_aggregator_prompt_inactive() -> None:
    """Aggregator prompt missing -> response_markdown explains, agents_called still includes labels."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        # aggregate_zoom_fail intentionally missing.
        ("investigator", "analyze_fail"): _prompt_row("[INVESTIGATOR_ANALYZE_FAIL_V1]"),
        ("citation", "find_regulatory_source"): _prompt_row("[CITATION_FIND_REGULATORY_SOURCE_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent_type": "zoom_fail", "confidence": 0.95})),
            _llm_response(json.dumps({"x": 1})),
            _llm_response(json.dumps({"y": 2})),
        ]
    )
    result = await orchestrate(
        message="Pourquoi ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    assert "regalica/aggregate_zoom_fail" in result.agents_called
    assert "Aucun prompt actif" in result.response_markdown
    assert "regalica/aggregate_zoom_fail" in result.response_markdown


@pytest.mark.asyncio
async def test_orchestrate_specialist_prompt_inactive_does_not_block_aggregator() -> None:
    """Missing specialist prompt -> outcome marked failed, aggregator still composes a response."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_zoom_fail"): _prompt_row("[REGALICA_AGGREGATE_ZOOM_FAIL_V1]"),
        # investigator/analyze_fail missing on purpose.
        ("citation", "find_regulatory_source"): _prompt_row("[CITATION_FIND_REGULATORY_SOURCE_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent_type": "zoom_fail", "confidence": 0.95})),
            # Only citation calls LLM (investigator load failed earlier).
            _llm_response(json.dumps({"circulaire": "BCT 2018-06"})),
            _llm_response("Réponse partielle : seule la citation est disponible."),
        ]
    )
    result = await orchestrate(
        message="Pourquoi ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    assert result.agents_called == [
        "investigator/analyze_fail",
        "citation/find_regulatory_source",
        "regalica/aggregate_zoom_fail",
    ]
    assert "Réponse partielle" in result.response_markdown


@pytest.mark.asyncio
async def test_orchestrate_thinking_trace_follows_persona_template() -> None:
    """Thinking trace prose: capital Mais / Donc, no bullets."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_general_help"): _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent_type": "general_help", "confidence": 0.6})),
            _llm_response("OK."),
        ]
    )
    result = await orchestrate(
        message="Test message",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    trace = result.thinking_trace
    assert trace.startswith("L'utilisateur demande")
    assert "Mais je pense" in trace
    assert "Donc je vais" in trace
    assert "Test message" in trace
    assert "general_help" in trace
    # Doctrine: prose, never bullet points.
    assert "•" not in trace
    assert "- " not in trace
    assert "\n" not in trace


@pytest.mark.asyncio
async def test_orchestrate_unknown_intent_falls_back_to_general_help() -> None:
    """Router emits an out-of-enum intent_type -> general_help fallback applied."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_general_help"): _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent_type": "made_up_intent_xyz", "confidence": 0.8})),
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
    assert "general_help" in result.thinking_trace
