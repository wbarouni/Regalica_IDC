"""Unit tests for Sprint C — Point 4 — inter-annex briefing helpers.

Two pure helpers exercised here:
  * `_format_dependency_list` — turns the DependencyAgent's `required` /
    `missing` list-of-dicts into a readable comma-separated annexe code
    string for the briefing prompt placeholders.
  * `_propagate_outputs` — promotes the dependency check output into
    the shared dict so `_render_briefing` can pick it up.

No I/O. No DB. No LLM.
"""

from __future__ import annotations

from typing import Any

from app.agents.base import AgentResult
from app.routes.upload import _StepRow, _format_dependency_list, _propagate_outputs


def test_format_dependency_list_renders_annexe_codes_separated_by_commas() -> None:
    items: list[Any] = [
        {"annexe_code": "RCM00", "dependency_type": "structural"},
        {"annexe_code": "RSM630", "dependency_type": "structural"},
    ]
    assert _format_dependency_list(items) == "RCM00, RSM630"


def test_format_dependency_list_returns_aucun_when_empty() -> None:
    assert _format_dependency_list([]) == "(aucun)"


def test_format_dependency_list_skips_entries_without_annexe_code() -> None:
    items: list[Any] = [
        {"dependency_type": "structural"},  # no annexe_code key
        {"annexe_code": ""},  # empty string skipped
        {"annexe_code": "RSM640"},
    ]
    assert _format_dependency_list(items) == "RSM640"


def test_format_dependency_list_collapses_to_aucun_when_all_filtered_out() -> None:
    items: list[Any] = [{"annexe_code": ""}, {"unrelated": "noise"}]
    assert _format_dependency_list(items) == "(aucun)"


def test_propagate_outputs_captures_dependency_status() -> None:
    """A successful `dependency` step exposes required/missing/autonomous."""
    shared: dict[str, Any] = {}
    step = _StepRow(step_order=2, agent_type="dependency", function_name="check")
    result = AgentResult(
        agent_name="t0_dependency",
        success=True,
        output={
            "primary_annexe": "RSM630",
            "required": [{"annexe_code": "RCM00"}],
            "missing": [{"annexe_code": "RCM00"}],
            "autonomous": False,
        },
        latency_ms=12,
    )
    _propagate_outputs(shared, step, result)
    assert shared["dependency_required"] == [{"annexe_code": "RCM00"}]
    assert shared["dependency_missing"] == [{"annexe_code": "RCM00"}]
    assert shared["dependency_autonomous"] is False


def test_propagate_outputs_dependency_failure_does_not_pollute_shared() -> None:
    """A failed dependency step must NOT leak its (likely empty) output."""
    shared: dict[str, Any] = {}
    step = _StepRow(step_order=2, agent_type="dependency", function_name="check")
    result = AgentResult(
        agent_name="t0_dependency",
        success=False,
        error="DB query failed",
        latency_ms=5,
    )
    _propagate_outputs(shared, step, result)
    assert "dependency_required" not in shared
    assert "dependency_missing" not in shared
    assert "dependency_autonomous" not in shared


def test_propagate_outputs_autonomous_run_lands_as_true() -> None:
    """Annexes with no inter-annex dependency surface autonomous=True."""
    shared: dict[str, Any] = {}
    step = _StepRow(step_order=2, agent_type="dependency", function_name="check")
    result = AgentResult(
        agent_name="t0_dependency",
        success=True,
        output={
            "primary_annexe": "00",
            "required": [],
            "missing": [],
            "autonomous": True,
        },
        latency_ms=8,
    )
    _propagate_outputs(shared, step, result)
    assert shared["dependency_autonomous"] is True
    assert shared["dependency_required"] == []
    assert shared["dependency_missing"] == []
