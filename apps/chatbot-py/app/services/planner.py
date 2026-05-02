"""Parser for the regalica/planner LLM JSON output.

Defensive interpretation of the `{plan_type, steps[]}` envelope
emitted by the planner LLM. The parser mirrors the seed
`output_schema` (apps/api/seeds/prompts.json regalica/planner) but
stays liberal in what it accepts — drift is logged at WARNING
level and the parser tries to salvage a usable plan rather than
hard-rejecting on a single malformed step. Hard errors (invalid
JSON, unknown plan_type, every step rejected) collapse to
`fallback_activated=True` so the orchestrator's P1 fallback
(intent_grammar table dispatch) can take over.

Validation rules enforced:

  * `plan_type ∈ {"execution", "clarification"}` — anything else
    triggers fallback.
  * `clarification` plans must carry an empty `steps` list (any
    non-empty list is logged and emptied).
  * `step_id` must be a positive integer assigned in strictly
    increasing order starting at 1; out-of-order or missing
    integers cause the step to be rejected.
  * `agent_id` must be in `valid_agent_ids` (the closed bearer set
    the planner was prompted with); rejected step otherwise.
  * `execution_mode ∈ {"sequential", "parallel"}` — invalid values
    are coerced to "sequential" with a WARNING.
  * `depends_on` may only reference step_id values strictly less
    than the current step's; forward / self references are
    silently dropped with a WARNING.
  * `len(steps) > max_steps` — extra steps are truncated with a
    WARNING.
  * Unknown keys inside a step are tolerated but logged.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, Final

_PLAN_TYPE_EXECUTION: Final[str] = "execution"
_PLAN_TYPE_CLARIFICATION: Final[str] = "clarification"
_VALID_PLAN_TYPES: Final[frozenset[str]] = frozenset(
    {_PLAN_TYPE_EXECUTION, _PLAN_TYPE_CLARIFICATION}
)

_EXECUTION_MODE_SEQUENTIAL: Final[str] = "sequential"
_EXECUTION_MODE_PARALLEL: Final[str] = "parallel"
_VALID_EXECUTION_MODES: Final[frozenset[str]] = frozenset(
    {_EXECUTION_MODE_SEQUENTIAL, _EXECUTION_MODE_PARALLEL}
)

_ALLOWED_STEP_KEYS: Final[frozenset[str]] = frozenset(
    {"step_id", "agent_id", "execution_mode", "depends_on", "params"}
)

_logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PlanStep:
    """One refined step in a planner-emitted execution plan."""

    step_id: int
    agent_id: str
    execution_mode: str
    depends_on: list[int]
    params: dict[str, Any]


@dataclass(frozen=True)
class ExecutionPlan:
    """Canonical planner output consumed by the orchestrator.

    `fallback_activated` signals to the orchestrator that the
    planner LLM produced no usable plan (hard parse error, unknown
    plan_type, or every step rejected); the orchestrator then
    reverts to the C2 dispatch table (intent_grammar.py) — the
    P1 fallback per docs/10 §16.
    """

    plan_type: str
    steps: list[PlanStep] = field(default_factory=list)
    fallback_activated: bool = False


def _fallback_plan() -> ExecutionPlan:
    return ExecutionPlan(
        plan_type=_PLAN_TYPE_EXECUTION,
        steps=[],
        fallback_activated=True,
    )


def _coerce_step(
    raw_step: Any,
    expected_step_id: int,
    valid_agent_ids: frozenset[str],
) -> PlanStep | None:
    """Return a sanitised PlanStep, or None when the step must be dropped."""
    if not isinstance(raw_step, dict):
        _logger.warning("planner step at position %d is not a dict; dropped", expected_step_id)
        return None

    extra_keys = set(raw_step.keys()) - _ALLOWED_STEP_KEYS
    if extra_keys:
        _logger.warning(
            "planner step %d carries unexpected keys: %s",
            expected_step_id,
            sorted(extra_keys),
        )

    step_id = raw_step.get("step_id")
    if isinstance(step_id, bool) or not isinstance(step_id, int) or step_id != expected_step_id:
        _logger.warning(
            "planner step_id %r does not match expected position %d; step dropped",
            step_id,
            expected_step_id,
        )
        return None

    agent_id = raw_step.get("agent_id")
    if not isinstance(agent_id, str) or agent_id not in valid_agent_ids:
        _logger.warning(
            "planner step %d references unknown agent_id %r; step dropped",
            expected_step_id,
            agent_id,
        )
        return None

    raw_mode = raw_step.get("execution_mode")
    if isinstance(raw_mode, str) and raw_mode in _VALID_EXECUTION_MODES:
        execution_mode = raw_mode
    else:
        _logger.warning(
            "planner step %d execution_mode %r invalid; coerced to 'sequential'",
            expected_step_id,
            raw_mode,
        )
        execution_mode = _EXECUTION_MODE_SEQUENTIAL

    raw_depends = raw_step.get("depends_on")
    depends_on: list[int] = []
    if isinstance(raw_depends, list):
        for ref in raw_depends:
            if isinstance(ref, bool) or not isinstance(ref, int):
                _logger.warning(
                    "planner step %d depends_on entry %r is not an integer; dropped",
                    expected_step_id,
                    ref,
                )
                continue
            if ref >= expected_step_id:
                _logger.warning(
                    "planner step %d depends_on %d is forward / self-ref; dropped",
                    expected_step_id,
                    ref,
                )
                continue
            depends_on.append(int(ref))

    raw_params = raw_step.get("params")
    params: dict[str, Any] = raw_params if isinstance(raw_params, dict) else {}

    return PlanStep(
        step_id=expected_step_id,
        agent_id=agent_id,
        execution_mode=execution_mode,
        depends_on=depends_on,
        params=params,
    )


def parse_planner_response(
    raw: str,
    valid_agent_ids: frozenset[str] | set[str],
    max_steps: int,
) -> ExecutionPlan:
    """Parse the planner LLM response, returning the canonical ExecutionPlan."""
    valid_set: frozenset[str] = frozenset(valid_agent_ids)

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        _logger.warning("planner LLM emitted non-JSON payload; activating P1 fallback")
        return _fallback_plan()

    if not isinstance(parsed, dict):
        _logger.warning("planner LLM payload is not a JSON object; activating P1 fallback")
        return _fallback_plan()

    plan_type = parsed.get("plan_type")
    if not isinstance(plan_type, str) or plan_type not in _VALID_PLAN_TYPES:
        _logger.warning("planner plan_type %r outside enum; activating P1 fallback", plan_type)
        return _fallback_plan()

    if plan_type == _PLAN_TYPE_CLARIFICATION:
        # The seed prompt instructs the LLM to emit an empty steps
        # list on clarification; if it doesn't, log and ignore the
        # extras rather than failing.
        raw_steps = parsed.get("steps", [])
        if isinstance(raw_steps, list) and raw_steps:
            _logger.warning(
                "planner clarification plan carries %d step(s); discarded",
                len(raw_steps),
            )
        return ExecutionPlan(
            plan_type=_PLAN_TYPE_CLARIFICATION,
            steps=[],
            fallback_activated=False,
        )

    raw_steps = parsed.get("steps")
    if not isinstance(raw_steps, list):
        _logger.warning("planner execution plan steps is not a list; activating P1 fallback")
        return _fallback_plan()

    if len(raw_steps) > max_steps:
        _logger.warning(
            "planner emitted %d steps; truncated to max_steps=%d",
            len(raw_steps),
            max_steps,
        )
        raw_steps = raw_steps[:max_steps]

    steps: list[PlanStep] = []
    for index, raw_step in enumerate(raw_steps, start=1):
        step = _coerce_step(raw_step, expected_step_id=index, valid_agent_ids=valid_set)
        if step is not None:
            steps.append(step)

    if not steps:
        _logger.warning("planner execution plan empty after validation; activating P1 fallback")
        return _fallback_plan()

    return ExecutionPlan(
        plan_type=_PLAN_TYPE_EXECUTION,
        steps=steps,
        fallback_activated=False,
    )
