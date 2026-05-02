"""Loaders for the regalica/planner runtime tunables in platform_config.

The planner LLM is invoked **conditionally** by the orchestrator —
only on intents whose canonical specialist set benefits from a
refinement pass over the dispatch table. Both the trigger list and
the depth cap are operator-controlled, so they live in
`platform_config` (alongside `sse_max_listeners`, migration 063)
rather than in source.

Doctrine reference: docs/03-ARCHITECTURE-ET-ZERO-HARDCODING.md §3
("Niveau 3 — toute valeur opérée par l'opérateur").
"""

from __future__ import annotations

from typing import Final

import asyncpg

from app.services.platform_config import (
    PlatformConfigShapeError,
    load_platform_config_value,
)

# platform_config keys seeded by migration 068. Code references the
# constant; the migration owns the literal so a rename only happens
# in one place.
_TRIGGER_INTENTS_KEY: Final[str] = "regalica_planner_trigger_intents"
_MAX_PLAN_STEPS_KEY: Final[str] = "regalica_planner_max_plan_steps"


async def load_planner_trigger_intents(pool: asyncpg.Pool) -> frozenset[str]:
    """Return the closed set of intents that trigger the planner LLM."""
    raw = await load_platform_config_value(pool, _TRIGGER_INTENTS_KEY)
    if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):
        raise PlatformConfigShapeError(_TRIGGER_INTENTS_KEY, "list[str]", raw)
    return frozenset(str(x) for x in raw)


async def load_planner_max_plan_steps(pool: asyncpg.Pool) -> int:
    """Return the maximum plan depth the planner LLM may emit."""
    raw = await load_platform_config_value(pool, _MAX_PLAN_STEPS_KEY)
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise PlatformConfigShapeError(_MAX_PLAN_STEPS_KEY, "int", raw)
    if raw < 1:
        raise PlatformConfigShapeError(_MAX_PLAN_STEPS_KEY, "int >= 1", raw)
    return int(raw)
