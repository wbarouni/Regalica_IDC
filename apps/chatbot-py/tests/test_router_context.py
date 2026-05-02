"""Unit tests for app.services.router_context — DB loaders + template render."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.router_context import (
    build_run_context,
    load_question_types_list,
    render_router_template,
)

# ---------------------------------------------------------------------------
# load_question_types_list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_load_question_types_list_returns_fn_names_in_order() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(
        return_value=[
            {"fn_name": "zoom"},
            {"fn_name": "cluster"},
            {"fn_name": "plan"},
        ]
    )
    out = await load_question_types_list(pool)
    assert out == ["zoom", "cluster", "plan"]


@pytest.mark.asyncio
async def test_load_question_types_list_returns_empty_when_table_empty() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=[])
    out = await load_question_types_list(pool)
    assert out == []


# ---------------------------------------------------------------------------
# build_run_context
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_build_run_context_returns_empty_when_run_absent() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value=None)
    out = await build_run_context(pool, "00000000-0000-0000-0000-000000000001", "tnt")
    assert out == {}


@pytest.mark.asyncio
async def test_build_run_context_surfaces_kpis_and_top_fails() -> None:
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
    pool.fetch = AsyncMock(
        return_value=[
            {
                "ax_term": "RSM630",
                "num_regle": 7,
                "severity": "severe",
                "expected_value": "100",
                "computed_value": "92",
                "gap_absolute": "8",
            },
            {
                "ax_term": "RSM630",
                "num_regle": 12,
                "severity": "rounding",
                "expected_value": "50",
                "computed_value": "49.99",
                "gap_absolute": "0.01",
            },
        ]
    )
    out = await build_run_context(pool, "rid", "tnt")
    assert out["primary_annexe_code"] == "RSM630"
    assert out["status"] == "completed"
    assert out["total_fail_severe"] == 4
    assert out["conformity_rate"] == "0.9960"
    assert len(out["top_fails"]) == 2
    assert out["top_fails"][0]["ax_term"] == "RSM630"
    assert out["top_fails"][0]["severity"] == "severe"
    assert out["top_fails"][0]["num_regle"] == 7


@pytest.mark.asyncio
async def test_build_run_context_handles_run_with_no_fails() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(
        return_value={
            "run_id": "rid",
            "status": "running",
            "primary_annexe_code": "00",
            "arrete_date": "2026-03-31",
            "total_rules_evaluated": None,
            "total_pass": None,
            "total_fail_severe": None,
            "total_fail_rounding": None,
            "conformity_rate": None,
        }
    )
    pool.fetch = AsyncMock(return_value=[])
    out = await build_run_context(pool, "rid", "tnt")
    assert out["status"] == "running"
    assert out["top_fails"] == []
    assert out["total_fail_severe"] is None


# ---------------------------------------------------------------------------
# render_router_template
# ---------------------------------------------------------------------------


def test_render_router_template_substitutes_run_context_and_question_types() -> None:
    template = "Intents: {question_types_list}. Run: {run_context}."
    out = render_router_template(
        template,
        run_context={"primary_annexe_code": "RSM630", "total_fail_severe": 4},
        question_types_list=["zoom", "cluster"],
    )
    assert "Intents: zoom, cluster." in out
    parsed_run = json.loads(out.split("Run: ", 1)[1].rstrip("."))
    assert parsed_run == {"primary_annexe_code": "RSM630", "total_fail_severe": 4}


def test_render_router_template_serialises_empty_run_context_as_empty_object() -> None:
    template = "{run_context}"
    out = render_router_template(template, run_context=None, question_types_list=[])
    assert json.loads(out) == {}


def test_render_router_template_tolerates_template_without_placeholders() -> None:
    """Backward compatibility — placeholder template like '[REGALICA_ROUTER_V1]'."""
    template = "[REGALICA_ROUTER_V1]"
    out = render_router_template(
        template,
        run_context={"x": 1},
        question_types_list=["zoom"],
    )
    assert out == "[REGALICA_ROUTER_V1]"


def test_render_router_template_returns_empty_for_unknown_placeholders() -> None:
    """Future-proof: unwired `{foo}` resolves to empty string instead of KeyError."""
    template = "Known: {run_context}. Unknown: {foo}."
    out = render_router_template(
        template,
        run_context={},
        question_types_list=[],
    )
    assert "Known: {}." in out
    assert "Unknown: ." in out
