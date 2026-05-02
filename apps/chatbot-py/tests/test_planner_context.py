"""Unit tests for `app.services.planner_context`.

Covers the three helpers the orchestrator wires into the planner
LLM call: candidate-set formatter, enriched run-context builder,
and template renderer.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import intent_grammar as ig
from app.services.planner_context import (
    build_enriched_run_context,
    load_candidate_specialists,
    render_planner_template,
)

_TENANT = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _seed_grammar_cache() -> Iterator[None]:
    """Pre-populate the intent grammar cache mirroring migrations 065+066."""
    ig.reset_intent_grammar_cache()
    ig._CACHE = ig.IntentGrammar(
        intents={
            "zoom": ig.IntentSpec(
                intent_type="zoom",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_zoom_fail",
                specialist_ids=("investigator", "citation"),
                ordinal=1,
            ),
            "general_help": ig.IntentSpec(
                intent_type="general_help",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_general_help",
                specialist_ids=(),
                ordinal=8,
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
        },
    )
    yield
    ig.reset_intent_grammar_cache()


# ---------------------------------------------------------------------------
# load_candidate_specialists
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_load_candidate_specialists_renders_one_line_per_bearer() -> None:
    pool = MagicMock()
    out = await load_candidate_specialists(pool=pool, intent="zoom")
    lines = out.splitlines()
    assert len(lines) == 2
    assert lines[0] == "investigator | investigator | analyze_fail"
    assert lines[1] == "citation | citation | find_regulatory_source"


@pytest.mark.asyncio
async def test_load_candidate_specialists_returns_empty_when_intent_has_no_set() -> None:
    pool = MagicMock()
    # general_help canonical specialist_ids is empty.
    out = await load_candidate_specialists(pool=pool, intent="general_help")
    assert out == ""


@pytest.mark.asyncio
async def test_load_candidate_specialists_returns_empty_when_intent_unknown() -> None:
    pool = MagicMock()
    out = await load_candidate_specialists(pool=pool, intent="nonexistent_intent")
    assert out == ""


@pytest.mark.asyncio
async def test_load_candidate_specialists_marks_unknown_bearer_lineage() -> None:
    """A specialist_id present in intents but absent from bearers surfaces clearly."""
    ig._CACHE = ig.IntentGrammar(
        intents={
            "weird": ig.IntentSpec(
                intent_type="weird",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_general_help",
                specialist_ids=("ghost_specialist",),
                ordinal=99,
            ),
        },
        bearers={},
    )
    pool = MagicMock()
    out = await load_candidate_specialists(pool=pool, intent="weird")
    assert out == "ghost_specialist | unknown | unknown"


# ---------------------------------------------------------------------------
# build_enriched_run_context
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_enriched_run_context_returns_empty_when_run_id_none() -> None:
    pool = MagicMock()
    out = await build_enriched_run_context(pool=pool, run_id=None, tenant_id=_TENANT)
    assert out == {}


@pytest.mark.asyncio
async def test_build_enriched_run_context_returns_empty_when_no_history_no_run() -> None:
    pool = MagicMock()
    out = await build_enriched_run_context(
        pool=pool, run_id=None, tenant_id=_TENANT, session_history=[]
    )
    assert out == {}


@pytest.mark.asyncio
async def test_build_enriched_run_context_attaches_session_history_alone() -> None:
    pool = MagicMock()
    out = await build_enriched_run_context(
        pool=pool,
        run_id=None,
        tenant_id=_TENANT,
        session_history=["q1", "q2"],
    )
    assert out == {"session_history": ["q1", "q2"]}


@pytest.mark.asyncio
async def test_build_enriched_run_context_caps_session_history() -> None:
    pool = MagicMock()
    out = await build_enriched_run_context(
        pool=pool,
        run_id=None,
        tenant_id=_TENANT,
        session_history=[f"q{i}" for i in range(20)],
    )
    history = out["session_history"]
    assert isinstance(history, list)
    assert len(history) == 5
    # Last five preserved (FIFO drop of older turns).
    assert history == ["q15", "q16", "q17", "q18", "q19"]


@pytest.mark.asyncio
async def test_build_enriched_run_context_merges_run_snapshot_and_history() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "run_id": "00000000-0000-7000-8000-000000000010",
            "status": "completed",
            "primary_annexe_code": "RSM630",
            "arrete_date": "2026-03-31",
            "total_rules_evaluated": 1245,
            "total_pass": 1240,
            "total_fail_severe": 4,
            "total_fail_rounding": 1,
            "conformity_rate": "0.9960",
        }
    )
    pool.fetch = AsyncMock(return_value=[])
    out = await build_enriched_run_context(
        pool=pool,
        run_id="00000000-0000-7000-8000-000000000010",
        tenant_id=_TENANT,
        session_history=["pourquoi 139/r3 ?"],
    )
    assert out["primary_annexe_code"] == "RSM630"
    assert out["session_history"] == ["pourquoi 139/r3 ?"]


# ---------------------------------------------------------------------------
# render_planner_template
# ---------------------------------------------------------------------------


def test_render_planner_template_substitutes_all_six_placeholders() -> None:
    template = (
        "intent={intent} confidence={confidence} message={message}\n"
        "candidates=<<{candidate_specialists}>>\n"
        "run={run_context} max_steps={max_plan_steps}"
    )
    out = render_planner_template(
        template,
        intent="simulation",
        confidence=0.87,
        message="Que se passe-t-il si annexe 47 vide ?",
        candidate_specialists="investigator | investigator | analyze_fail",
        run_context={"primary_annexe_code": "47"},
        max_plan_steps=4,
    )
    assert "intent=simulation" in out
    assert "confidence=0.87" in out
    assert "message=Que se passe-t-il si annexe 47 vide ?" in out
    assert "candidates=<<investigator | investigator | analyze_fail>>" in out
    assert '"primary_annexe_code": "47"' in out
    assert "max_steps=4" in out


def test_render_planner_template_serialises_empty_run_context_as_object() -> None:
    template = "{run_context}"
    out = render_planner_template(
        template,
        intent="zoom",
        confidence=0.5,
        message="x",
        candidate_specialists="",
        run_context=None,
        max_plan_steps=4,
    )
    assert json.loads(out) == {}


def test_render_planner_template_returns_empty_for_unknown_placeholders() -> None:
    """DefensiveFormatMap fallback — unknown {foo} renders as empty string."""
    template = "Known: {intent}. Unknown: {foo}."
    out = render_planner_template(
        template,
        intent="plan",
        confidence=0.9,
        message="x",
        candidate_specialists="",
        run_context={},
        max_plan_steps=4,
    )
    assert "Known: plan." in out
    assert "Unknown: ." in out
