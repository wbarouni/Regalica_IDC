"""Wiring tests for the conditional planner step inside `orchestrate`.

These specs exercise the four orchestrator paths that the planner
introduces:

  P-canon  intent ∉ trigger_intents → canonical dispatch (no planner LLM call)
  P-clar   confidence < 0.65 in a triggered intent → clarification short-circuit
  P-T3     intent ∈ trigger_intents + confidence ≥ 0.65 + valid plan
           → planner-refined specialist set
  P-fall   triggered + planner LLM emits unparseable → P1 fallback
           (canonical dispatch resumes)

The autouse fixture pre-populates platform_config._CACHE with the
canonical trigger list so the orchestrator's tunable lookup hits
the cache instead of the mock pool.
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
                specialist_ids=("investigator", "citation", "historical"),
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
        },
    )
    pc._CACHE["regalica_planner_trigger_intents"] = ["simulation", "sanction", "plan"]
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
        "temperature": 0.3,
        "max_tokens": 4096,
        "thinking_enabled": False,
        "target_model": "gemini-2.5-flash",
        # Planner specs exercise router + planner + aggregator paths;
        # the aggregator paths in those specs go through canonical
        # dispatch where output_contract = "string" (migration 069
        # backfill). For non-aggregator prompts (router, planner,
        # specialists) the value is harmless — _invoke_aggregator
        # only reads it when composing the final response.
        "output_contract": "string",
    }


def _build_pool(
    prompts: dict[tuple[str, str], dict[str, Any] | None],
) -> MagicMock:
    """Mock pool that dispatches fetchrow by query substring."""
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


def _build_llm(responses: list[LLMResponse]) -> MagicMock:
    client = MagicMock()
    client.complete = AsyncMock(side_effect=list(responses))
    return client


# ---------------------------------------------------------------------------
# P-canon — intent outside trigger set goes straight through
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_planner_skipped_when_intent_outside_trigger_set() -> None:
    """general_help ∉ trigger_intents → no planner LLM call, canonical dispatch."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row(),
        ("regalica", "aggregate_general_help"): _prompt_row(),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.9})),
            _llm_response("Bonjour."),
        ]
    )
    result = await orchestrate(
        message="Bonjour qui êtes-vous ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    # Exactly 2 LLM calls — router + aggregator. No planner.
    assert llm.complete.await_count == 2
    assert result.agents_called == ["regalica/aggregate_general_help"]


# ---------------------------------------------------------------------------
# P-clar — low confidence on a triggered intent collapses to clarification
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_planner_short_circuits_to_clarification_below_threshold() -> None:
    """simulation @ confidence 0.40 → ambiguous aggregator (no planner LLM call)."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row(),
        ("regalica", "aggregate_ambiguous"): _prompt_row(),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "simulation", "confidence": 0.40})),
            _llm_response("Pouvez-vous préciser le scénario ?"),
        ]
    )
    result = await orchestrate(
        message="simule",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    # Router + ambiguous-aggregator only; planner LLM never called.
    assert llm.complete.await_count == 2
    assert result.agents_called == ["regalica/aggregate_ambiguous"]


# ---------------------------------------------------------------------------
# P-T3 — triggered intent + valid plan refines the candidate set
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_planner_refines_candidate_set_on_valid_plan() -> None:
    """simulation @ 0.85 + planner picks investigator only → 1 specialist invoked."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row(),
        ("regalica", "planner"): _prompt_row("Plan template {intent} {confidence} {message}"),
        ("regalica", "aggregate_simulation_impact"): _prompt_row(),
        ("investigator", "analyze_fail"): _prompt_row(),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "simulation", "confidence": 0.85})),
            # Planner picks ONLY investigator (refinement).
            _llm_response(
                json.dumps(
                    {
                        "plan_type": "execution",
                        "steps": [
                            {
                                "step_id": 1,
                                "agent_id": "investigator",
                                "execution_mode": "parallel",
                                "depends_on": [],
                                "params": {"intent": "simulation", "confidence": 0.85},
                            }
                        ],
                    }
                )
            ),
            # Investigator output.
            _llm_response(json.dumps({"cause_racine": "rubrique manquante"})),
            # Aggregator final markdown.
            _llm_response("Si vous videz l'annexe 47, le KPI X varie de 12%."),
        ]
    )
    result = await orchestrate(
        message="Que se passe-t-il si annexe 47 vide ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id=None,
    )
    # Router + planner + investigator + aggregator = 4 LLM calls.
    assert llm.complete.await_count == 4
    # Citation and Historical are NOT invoked — planner refined them out.
    assert "investigator/analyze_fail" in result.agents_called
    assert "citation/find_regulatory_source" not in result.agents_called
    assert "historical/compare_runs_history" not in result.agents_called
    assert result.agents_called[-1] == "regalica/aggregate_simulation_impact"


# ---------------------------------------------------------------------------
# P-fall — invalid planner output → P1 fallback to canonical dispatch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_planner_p1_fallback_when_response_unparseable() -> None:
    """Planner emits garbage → orchestrator dispatches the full canonical set."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row(),
        ("regalica", "planner"): _prompt_row("Plan template"),
        ("regalica", "aggregate_simulation_impact"): _prompt_row(),
        ("investigator", "analyze_fail"): _prompt_row(),
        ("citation", "find_regulatory_source"): _prompt_row(),
        ("historical", "compare_runs_history"): _prompt_row(),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "simulation", "confidence": 0.85})),
            _llm_response("not a json blob"),  # planner garbage → fallback
            _llm_response(json.dumps({"x": 1})),  # investigator
            _llm_response(json.dumps({"x": 2})),  # citation
            # Historical: pool.fetch returns [] → stable fallback (no LLM)
            _llm_response("Synthèse globale."),  # aggregator
        ]
    )
    result = await orchestrate(
        message="Simule",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id="33333333-3333-3333-3333-333333333333",
    )
    # Canonical dispatch ran — all three specialists labelled.
    assert "investigator/analyze_fail" in result.agents_called
    assert "citation/find_regulatory_source" in result.agents_called
    assert "historical/compare_runs_history" in result.agents_called


# ---------------------------------------------------------------------------
# Trigger list comes from DB (zero hardcoding) — alter cache, behaviour shifts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_trigger_intents_loaded_from_platform_config_cache() -> None:
    """Empty trigger list (cache) makes planner skip even on simulation."""
    pc._CACHE["regalica_planner_trigger_intents"] = []  # operator disables planner
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row(),
        ("regalica", "aggregate_simulation_impact"): _prompt_row(),
        ("investigator", "analyze_fail"): _prompt_row(),
        ("citation", "find_regulatory_source"): _prompt_row(),
        ("historical", "compare_runs_history"): _prompt_row(),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "simulation", "confidence": 0.95})),
            _llm_response(json.dumps({"x": 1})),  # investigator
            _llm_response(json.dumps({"x": 2})),  # citation
            _llm_response("Synthèse."),  # aggregator
        ]
    )
    result = await orchestrate(
        message="Simule",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    # Only 4 calls: router + 2 specialists with LLM + aggregator.
    # The planner was NOT invoked — empty trigger list short-circuits.
    assert llm.complete.await_count == 4
    assert "regalica/aggregate_simulation_impact" in result.agents_called
