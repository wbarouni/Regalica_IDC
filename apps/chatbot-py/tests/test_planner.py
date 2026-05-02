"""Unit tests for `app.services.planner.parse_planner_response`.

Pure in-process: no DB, no LLM. The parser receives raw JSON
strings (as the LLM client would emit them) and returns sanitised
ExecutionPlan dataclasses; defensive coercion + WARNING logs make
drift visible without breaking the dispatch path.
"""

from __future__ import annotations

import json

import pytest
from app.services.planner import (
    ExecutionPlan,
    PlanStep,
    parse_planner_response,
)

# Mirrors a realistic candidate set (intent_grammar.intents["zoom"]
# bearers per migration 065 + 066 fixture in test_orchestrator.py).
_VALID_AGENTS = frozenset({"investigator", "citation", "historical"})


def _step_payload(
    step_id: int,
    agent_id: str,
    *,
    execution_mode: str = "parallel",
    depends_on: list[int] | None = None,
    params: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "step_id": step_id,
        "agent_id": agent_id,
        "execution_mode": execution_mode,
        "depends_on": depends_on if depends_on is not None else [],
        "params": params if params is not None else {"intent": "zoom", "confidence": 0.9},
    }


def _execution_plan(steps: list[dict[str, object]]) -> str:
    return json.dumps({"plan_type": "execution", "steps": steps})


# ---------------------------------------------------------------------------
# Happy path — execution + clarification
# ---------------------------------------------------------------------------


def test_parse_returns_clean_two_step_execution_plan() -> None:
    raw = _execution_plan(
        [
            _step_payload(1, "investigator"),
            _step_payload(2, "citation"),
        ]
    )
    plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert isinstance(plan, ExecutionPlan)
    assert plan.plan_type == "execution"
    assert plan.fallback_activated is False
    assert [step.step_id for step in plan.steps] == [1, 2]
    assert [step.agent_id for step in plan.steps] == ["investigator", "citation"]
    assert all(isinstance(step, PlanStep) for step in plan.steps)


def test_parse_clarification_plan_has_empty_steps_no_fallback() -> None:
    raw = json.dumps({"plan_type": "clarification", "steps": []})
    plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.plan_type == "clarification"
    assert plan.steps == []
    assert plan.fallback_activated is False


def test_parse_clarification_plan_drops_unexpected_steps_with_warning(
    caplog: pytest.LogCaptureFixture,
) -> None:
    raw = json.dumps(
        {
            "plan_type": "clarification",
            "steps": [_step_payload(1, "investigator")],
        }
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.plan_type == "clarification"
    assert plan.steps == []
    assert any("clarification plan carries" in r.getMessage() for r in caplog.records)


# ---------------------------------------------------------------------------
# Drift detection — invalid agent_id, mode, depends_on
# ---------------------------------------------------------------------------


def test_parse_drops_step_with_unknown_agent_id_and_warns(
    caplog: pytest.LogCaptureFixture,
) -> None:
    raw = _execution_plan(
        [
            _step_payload(1, "investigator"),
            _step_payload(2, "made_up_agent"),
        ]
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    # The unknown step is dropped; the surviving step keeps its position.
    assert [step.agent_id for step in plan.steps] == ["investigator"]
    assert any("made_up_agent" in r.getMessage() for r in caplog.records)


def test_parse_coerces_invalid_execution_mode_to_sequential(
    caplog: pytest.LogCaptureFixture,
) -> None:
    raw = _execution_plan(
        [
            _step_payload(1, "investigator", execution_mode="async_burst"),
        ]
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.steps[0].execution_mode == "sequential"
    assert any("async_burst" in r.getMessage() for r in caplog.records)


def test_parse_drops_forward_depends_on_references(
    caplog: pytest.LogCaptureFixture,
) -> None:
    raw = _execution_plan(
        [
            _step_payload(1, "investigator", depends_on=[2]),  # forward ref
            _step_payload(2, "citation", depends_on=[1]),
        ]
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.steps[0].depends_on == []
    assert plan.steps[1].depends_on == [1]
    assert any("forward / self-ref" in r.getMessage() for r in caplog.records)


def test_parse_drops_self_reference_in_depends_on(
    caplog: pytest.LogCaptureFixture,
) -> None:
    raw = _execution_plan(
        [
            _step_payload(1, "investigator", depends_on=[1]),  # self-ref
        ]
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.steps[0].depends_on == []
    assert any("forward / self-ref" in r.getMessage() for r in caplog.records)


def test_parse_drops_step_id_out_of_sequence(caplog: pytest.LogCaptureFixture) -> None:
    raw = _execution_plan(
        [
            _step_payload(2, "investigator"),  # should have been step_id=1
        ]
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    # Step rejected → empty plan → P1 fallback.
    assert plan.fallback_activated is True
    assert plan.steps == []


def test_parse_truncates_when_steps_exceed_max(caplog: pytest.LogCaptureFixture) -> None:
    raw = _execution_plan(
        [
            _step_payload(1, "investigator"),
            _step_payload(2, "citation"),
            _step_payload(3, "historical"),
        ]
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=2)
    assert len(plan.steps) == 2
    assert any("truncated to max_steps=2" in r.getMessage() for r in caplog.records)


def test_parse_warns_on_unknown_step_keys(caplog: pytest.LogCaptureFixture) -> None:
    raw = json.dumps(
        {
            "plan_type": "execution",
            "steps": [
                {
                    **_step_payload(1, "investigator"),
                    "extra_field": "noise",
                }
            ],
        }
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.steps[0].agent_id == "investigator"
    assert any("extra_field" in r.getMessage() for r in caplog.records)


# ---------------------------------------------------------------------------
# Hard fallback — invalid envelopes
# ---------------------------------------------------------------------------


def test_parse_fallback_on_invalid_json(caplog: pytest.LogCaptureFixture) -> None:
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response("not a json blob", _VALID_AGENTS, max_steps=4)
    assert plan.fallback_activated is True
    assert plan.steps == []
    assert any("non-JSON payload" in r.getMessage() for r in caplog.records)


def test_parse_fallback_on_unknown_plan_type(caplog: pytest.LogCaptureFixture) -> None:
    raw = json.dumps({"plan_type": "swarm", "steps": []})
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.fallback_activated is True
    assert any("outside enum" in r.getMessage() for r in caplog.records)


def test_parse_fallback_when_payload_is_not_object() -> None:
    plan = parse_planner_response(json.dumps([]), _VALID_AGENTS, max_steps=4)
    assert plan.fallback_activated is True


def test_parse_fallback_when_steps_field_missing() -> None:
    raw = json.dumps({"plan_type": "execution"})
    plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.fallback_activated is True


def test_parse_fallback_when_every_step_invalid(caplog: pytest.LogCaptureFixture) -> None:
    raw = _execution_plan(
        [
            _step_payload(1, "made_up_a"),
            _step_payload(2, "made_up_b"),
        ]
    )
    with caplog.at_level("WARNING", logger="app.services.planner"):
        plan = parse_planner_response(raw, _VALID_AGENTS, max_steps=4)
    assert plan.fallback_activated is True
    assert plan.steps == []
    assert any("empty after validation" in r.getMessage() for r in caplog.records)
