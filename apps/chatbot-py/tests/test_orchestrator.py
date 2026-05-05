"""Unit tests for `app.services.orchestrator.orchestrate`.

Mocks: pool.fetchrow / pool.fetch are AsyncMock; LLMClient.complete
is AsyncMock returning canned LLMResponse. No network, no DB.

The pool fixture matches prompt_bank rows by (agent_type,
function_name) instead of relying on call order, because the
orchestrator now launches the aggregator-prompt fetch and the
specialist-prompt fetches concurrently via asyncio.gather.

Since commit C8 the intent grammar (intent → aggregator + specialist
list, plus specialist_id → bearer) is loaded from the DB at runtime
through `intent_grammar.load_intent_grammar`. The autouse fixture
below pre-populates that cache with the canonical seed (migration
065 + 066) so the spec bodies stay focused on the orchestrator
pipeline.
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
from app.services.orchestrator import OrchestratorResult, _load_run_fails_context, orchestrate


@pytest.fixture(autouse=True)
def _seed_intent_grammar_cache() -> Iterator[None]:
    """Mirror the canonical seed from migrations 065 + 066 in-memory.

    Also pre-seeds platform_config with an EMPTY planner trigger list
    so the conditional planner step (commit C10/2) never fires in
    these specs — they exercise the canonical dispatch path that
    pre-dates the planner. Planner-specific behaviour is covered by
    test_orchestrator_planner.py.
    """
    ig.reset_intent_grammar_cache()
    pc.reset_platform_config_cache()
    pc._CACHE["regalica_planner_trigger_intents"] = []
    pc._CACHE["regalica_planner_max_plan_steps"] = 4
    ig._CACHE = ig.IntentGrammar(
        intents={
            "zoom": ig.IntentSpec(
                intent_type="zoom",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_zoom_fail",
                specialist_ids=("investigator", "citation"),
                ordinal=1,
            ),
            "cluster": ig.IntentSpec(
                intent_type="cluster",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_grappe_cause_racine",
                specialist_ids=("investigator",),
                ordinal=2,
            ),
            "historical": ig.IntentSpec(
                intent_type="historical",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_historique_recurrence",
                specialist_ids=("historical",),
                ordinal=3,
            ),
            "citation": ig.IntentSpec(
                intent_type="citation",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_citation_reglementaire",
                specialist_ids=("citation",),
                ordinal=4,
            ),
            "simulation": ig.IntentSpec(
                intent_type="simulation",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_simulation_impact",
                specialist_ids=(),
                ordinal=5,
            ),
            "sanction": ig.IntentSpec(
                intent_type="sanction",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_estimation_sanction",
                specialist_ids=(),
                ordinal=6,
            ),
            "plan": ig.IntentSpec(
                intent_type="plan",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_plan_optimal",
                specialist_ids=("investigator", "historical"),
                ordinal=7,
            ),
            "general_help": ig.IntentSpec(
                intent_type="general_help",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_general_help",
                specialist_ids=(),
                ordinal=8,
            ),
            "out_of_scope": ig.IntentSpec(
                intent_type="out_of_scope",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_out_of_scope",
                specialist_ids=(),
                ordinal=9,
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
        # Default mirrors migration 069 backfill: every prompt seeded
        # before the planner refactor was a JSON-contract one. Aggregator
        # specs that need the new "string" contract override at the
        # call site.
        "output_contract": "json",
        # Migration 070 fields — None / 'standard' default mirrors what
        # load_active_prompt sees when the row was seeded by 043 and
        # not yet touched by 070-B/C.
        "static_response": None,
        "model_tier": "standard",
    }


def _build_pool(
    prompts: dict[tuple[str, str], dict[str, Any] | None] | None = None,
    run_context_row: dict[str, Any] | None = None,
    top_fails: list[dict[str, Any]] | None = None,
    question_types: list[str] | None = None,
) -> MagicMock:
    """Mock pool whose fetchrow / fetch dispatch by query substring.

    Supports three dispatch sources at once (any may be `None`):
      * `prompts`: prompt_bank rows by (agent_type, function_name).
      * `run_context_row`: validation_runs row returned to
        `build_run_context`. None => the run is treated as absent.
      * `top_fails`: validation_fail_details rows returned to
        `build_run_context`. Defaults to [].
      * `question_types`: list of fn_name strings returned to
        `load_question_types_list`. Defaults to [].
    """
    prompt_table = prompts or {}
    fails = top_fails or []
    qt_rows = [{"fn_name": fn} for fn in (question_types or [])]

    async def fake_fetchrow(query: str, *args: Any) -> dict[str, Any] | None:
        if "FROM prompt_bank" in query:
            agent_type = args[1] if len(args) > 1 else None
            function_name = args[2] if len(args) > 2 else None
            return prompt_table.get((agent_type, function_name))
        if "FROM validation_runs" in query:
            return run_context_row
        return None

    async def fake_fetch(query: str, *args: Any) -> list[dict[str, Any]]:
        if "FROM question_types" in query:
            return qt_rows
        if "FROM validation_fail_details" in query:
            return fails
        return []

    pool = MagicMock()
    pool.fetchrow = AsyncMock(side_effect=fake_fetchrow)
    pool.fetch = AsyncMock(side_effect=fake_fetch)
    return pool


def _build_llm(responses: list[LLMResponse]) -> MagicMock:
    client = MagicMock()
    client.complete = AsyncMock(side_effect=list(responses))
    return client


_TENANT = "00000000-0000-0000-0000-000000000001"


@pytest.mark.asyncio
async def test_orchestrate_zoom_invokes_investigator_and_citation_then_aggregator() -> None:
    """zoom intent → Investigator + Citation in parallel, then aggregator."""
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
            _llm_response(json.dumps({"intent": "zoom", "confidence": 0.95})),
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
    assert "zoom" in result.thinking_trace
    assert "investigator" in result.thinking_trace
    assert "citation" in result.thinking_trace
    # 1 router + 2 specialists + 1 aggregator = 4 LLM calls.
    assert llm.complete.await_count == 4


@pytest.mark.asyncio
async def test_orchestrate_citation_invokes_only_citation_and_aggregator() -> None:
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
            _llm_response(json.dumps({"intent": "citation", "confidence": 0.92})),
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
async def test_orchestrate_historical_invokes_historical_and_aggregator() -> None:
    """historique_recurrence → Historical + aggregator.
    No previous run -> stable fallback inside agent."""
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
            _llm_response(json.dumps({"intent": "historical", "confidence": 0.88})),
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
async def test_orchestrate_plan_invokes_investigator_and_historical_in_parallel() -> None:
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
            _llm_response(json.dumps({"intent": "plan", "confidence": 0.85})),
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
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.7})),
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
    """Aggregator prompt missing -> response_markdown explains,
    agents_called still includes labels."""
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        # aggregate_zoom intentionally missing.
        ("investigator", "analyze_fail"): _prompt_row("[INVESTIGATOR_ANALYZE_FAIL_V1]"),
        ("citation", "find_regulatory_source"): _prompt_row("[CITATION_FIND_REGULATORY_SOURCE_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "zoom", "confidence": 0.95})),
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
            _llm_response(json.dumps({"intent": "zoom", "confidence": 0.95})),
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
    """Thinking trace as 4 verbose phases (Correction 2).

    Until Correction 2 the trace was a single one-line sentence; the
    workspace v5 mockup (`docs/mockups/regalica-workspace-v5.html`
    :715-728) renders it as 4 explicit phases instead. The trace
    remains deterministic (no LLM call) but its prose is broken into
    Compréhension / Options / Arbitrages / Décision.
    """
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row("[REGALICA_ROUTER_V1]"),
        ("regalica", "aggregate_general_help"): _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
    }
    pool = _build_pool(prompts)
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.6})),
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
    # Phase 1 still opens with the persona template prefix.
    assert trace.startswith("1 · Compréhension de la demande")
    assert "L'utilisateur demande : « Test message »." in trace
    # The 4 phase headings MUST all be present.
    assert "1 · Compréhension" in trace
    assert "2 · Options considérées" in trace
    assert "3 · Arbitrages" in trace
    assert "4 · Décision" in trace
    # Phase 4 still carries the persona template close.
    assert "Donc je vais" in trace
    assert "general_help" in trace
    # Doctrine: prose paragraphs, never bullet points (• or - prefix).
    assert "•" not in trace
    # The frontend renders trace via whitespace-pre-line so paragraph
    # breaks (\n\n between phases) MUST be present — they are the
    # contract, not a violation.
    assert "\n\n" in trace


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
            _llm_response(json.dumps({"intent": "made_up_intent_xyz", "confidence": 0.8})),
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


# ---------------------------------------------------------------------------
# C9 — router prompt enriched with run context + question_types list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_orchestrate_injects_run_context_and_question_types_into_router_prompt() -> None:
    """When current_run_id is provided, the router system_prompt must
    contain the JSON-serialised run context AND the comma-joined
    question_types list. The router LLM call is the first complete()
    invocation; we read its system_prompt from the call args.
    """
    router_template = "Tu es le router. Intentions: {question_types_list}. Run: {run_context}."
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row(router_template),
        ("regalica", "aggregate_general_help"): _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
    }
    pool = _build_pool(
        prompts,
        run_context_row={
            "run_id": "00000000-0000-7000-8000-000000000010",
            "status": "completed",
            "primary_annexe_code": "RSM630",
            "arrete_date": "2026-03-31",
            "total_rules_evaluated": 1245,
            "total_pass": 1240,
            "total_fail_severe": 4,
            "total_fail_rounding": 1,
            "conformity_rate": "0.9960",
        },
        top_fails=[
            {
                "ax_term": "RSM630",
                "num_regle": 7,
                "severity": "severe",
                "expected_value": "100",
                "computed_value": "92",
                "gap_absolute": "8",
            }
        ],
        question_types=["zoom", "cluster", "plan"],
    )
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.6})),
            _llm_response("Voici la synthèse."),
        ]
    )
    await orchestrate(
        message="Que dois-je faire ?",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id="00000000-0000-7000-8000-000000000010",
    )
    router_request = llm.complete.call_args_list[0].args[0]
    sys_prompt = router_request.system_prompt
    # question_types list appears verbatim joined with ", "
    assert "Intentions: zoom, cluster, plan" in sys_prompt
    # run context fields appear inside the JSON-serialised block
    assert '"primary_annexe_code": "RSM630"' in sys_prompt
    assert '"total_fail_severe": 4' in sys_prompt
    assert "RSM630" in sys_prompt  # also from top_fails
    assert "severe" in sys_prompt


@pytest.mark.asyncio
async def test_orchestrate_router_prompt_omits_run_context_when_no_run_id() -> None:
    """No current_run_id => the run_context placeholder gets `{}`."""
    router_template = "Run: {run_context}. List: {question_types_list}."
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row(router_template),
        ("regalica", "aggregate_general_help"): _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
    }
    pool = _build_pool(prompts, question_types=["zoom"])
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.5})),
            _llm_response("ok"),
        ]
    )
    await orchestrate(
        message="hello",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
    )
    sys_prompt = llm.complete.call_args_list[0].args[0].system_prompt
    assert "Run: {}." in sys_prompt
    assert "List: zoom." in sys_prompt


# ─────────────────────────────────────────────────────────────────────
# Point 3 — _load_run_fails_context
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_load_run_fails_context_returns_top_fails_in_severity_order() -> None:
    """Severe FAILs come first, then rounding, ordered by gap_absolute desc."""
    rows = [
        {
            "rule_id": "00000000-0000-0000-0000-000000000001",
            "ax_term": "630",
            "num_regle": 266,
            "severity": "severe",
            "expected_value": 100.0,
            "computed_value": 80.0,
            "gap_absolute": 20.0,
            "gap_relative": 0.2,
        },
    ]
    pool = _build_pool(top_fails=rows)
    out = await _load_run_fails_context(
        pool,
        run_id="00000000-0000-0000-0000-000000000aaa",
        tenant_id=_TENANT,
    )
    assert out is not None
    assert out["run_id"] == "00000000-0000-0000-0000-000000000aaa"
    assert out["total_count"] == 1
    assert out["top_fails"][0]["ax_term"] == "630"
    assert out["top_fails"][0]["severity"] == "severe"
    assert out["top_fails"][0]["gap_absolute"] == 20.0


@pytest.mark.asyncio
async def test_load_run_fails_context_empty_run_returns_zero_count() -> None:
    pool = _build_pool(top_fails=[])
    out = await _load_run_fails_context(
        pool,
        run_id="00000000-0000-0000-0000-000000000bbb",
        tenant_id=_TENANT,
    )
    assert out is not None
    assert out["total_count"] == 0
    assert out["top_fails"] == []


@pytest.mark.asyncio
async def test_load_run_fails_context_returns_none_on_db_error() -> None:
    pool = MagicMock()

    async def boom(*_args: Any, **_kw: Any) -> None:
        raise RuntimeError("db down")

    pool.fetch = AsyncMock(side_effect=boom)
    out = await _load_run_fails_context(
        pool,
        run_id="00000000-0000-0000-0000-000000000ccc",
        tenant_id=_TENANT,
    )
    # Best-effort: SQL failures degrade silently to None so the
    # orchestrator falls back to the pre-Point-3 behaviour without
    # surfacing a 500.
    assert out is None


@pytest.mark.asyncio
async def test_orchestrate_zoom_preloads_fail_context_when_caller_omits_it() -> None:
    """Point 3 — caller passes only current_run_id; orchestrate
    preloads the run's top FAILs into fail_context for the zoom intent
    so the investigator specialist gets concrete data instead of {}."""
    router_template = "Router. Run: {run_context}. List: {question_types_list}. Msg: {message}."
    prompts: dict[tuple[str, str], dict[str, Any] | None] = {
        ("regalica", "router"): _prompt_row(router_template),
        ("regalica", "aggregate_zoom_fail"): _prompt_row("[ZOOM]"),
        ("investigator", "analyze_fail"): _prompt_row("[INV]"),
        ("citation", "find_regulatory_source"): _prompt_row("[CIT]"),
    }
    fails = [
        {
            "rule_id": "00000000-0000-0000-0000-000000000010",
            "ax_term": "630",
            "num_regle": 266,
            "severity": "severe",
            "expected_value": 100.0,
            "computed_value": 80.0,
            "gap_absolute": 20.0,
            "gap_relative": 0.2,
        },
    ]
    run_id = "00000000-0000-0000-0000-000000000fff"
    run_row = {
        # router_context.py:71 aliases id::text AS run_id, so the
        # mock pool must already expose the projected key.
        "run_id": run_id,
        "tenant_id": _TENANT,
        "primary_annexe_code": "RSM630",
        "arrete_date": "2026-02-28",
        "status": "completed",
        "total_rules_evaluated": 1245,
        "total_pass": 1242,
        "total_fail_severe": 1,
        "total_fail_rounding": 0,
        "conformity_rate": 0.9988,
    }
    pool = _build_pool(
        prompts=prompts,
        run_context_row=run_row,
        top_fails=fails,
        question_types=["zoom", "general_help"],
    )
    llm = _build_llm(
        [
            _llm_response(json.dumps({"intent": "zoom", "confidence": 0.95})),
            _llm_response(json.dumps({"hypothesis": "ok"})),  # investigator
            _llm_response(json.dumps({"source": "BCT 2017-06"})),  # citation
            _llm_response("ok zoom"),  # aggregator
        ]
    )
    out = await orchestrate(
        message="regarde le FAIL 630/266",
        tenant_id=_TENANT,
        pool=pool,
        llm_client=llm,
        current_run_id=run_id,
        # Caller (frontend useChat) does NOT pass fail_context — Point 3
        # preload should kick in for the zoom intent.
    )
    assert isinstance(out, OrchestratorResult)
    # The investigator's user prompt is the JSON of fail_context+rule_context.
    # The 2nd LLM call is the investigator (router was 1st). Its prompt
    # body must mention the preloaded ax_term/num_regle/severity.
    investigator_prompt = llm.complete.call_args_list[1].args[0].prompt
    assert "630" in investigator_prompt
    assert "266" in investigator_prompt
    assert "severe" in investigator_prompt
