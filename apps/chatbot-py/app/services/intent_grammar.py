"""Cached loader for the orchestrator's intent grammar.

Reads the operative subset of `intent_specialists` and
`intent_specialist_bearers` (commit C7 / migrations 064-066) into
typed dataclasses so the orchestrator and router never see a
hardcoded enum, dispatch dict, or aggregator-bearer name.

Doctrine
  - Process-global table; a single load on first call serves every
    chat turn. Phase 6 will swap the manual cache for LISTEN/NOTIFY
    invalidation; until then a chatbot-py restart is the cache-
    invalidation signal — same convention as platform_config and
    prompt_loader.
  - Failures bubble up as exceptions: the orchestrator's caller
    decides whether to fall back to a no-router result.
"""

from __future__ import annotations

from dataclasses import dataclass

import asyncpg


@dataclass(frozen=True)
class IntentSpec:
    """One intent's dispatch declaration (intent_specialists row)."""

    intent_type: str
    aggregator_agent_type: str
    aggregator_function_name: str
    specialist_ids: tuple[str, ...]
    ordinal: int


@dataclass(frozen=True)
class SpecialistBearer:
    """One specialist's prompt_bank target (intent_specialist_bearers row)."""

    specialist_id: str
    agent_type: str
    function_name: str


@dataclass(frozen=True)
class IntentGrammar:
    """Snapshot of the active intent grammar."""

    intents: dict[str, IntentSpec]
    bearers: dict[str, SpecialistBearer]

    @property
    def intent_types(self) -> frozenset[str]:
        """Closed set of intent_type strings the router LLM may emit."""
        return frozenset(self.intents.keys())


_CACHE: IntentGrammar | None = None


async def load_intent_grammar(pool: asyncpg.Pool) -> IntentGrammar:
    """Return the cached IntentGrammar, loading it from DB on first call.

    Reads the two `_active` views so the queries already exclude
    deleted / inactive / non-promoted rows. Specialist_ids stored
    JSONB-array become Python `tuple[str, ...]`. Both queries are
    one-shot; the loader does not paginate.
    """
    global _CACHE
    if _CACHE is not None:
        return _CACHE

    intent_rows = await pool.fetch(
        """
        SELECT intent_type,
               aggregator_agent_type,
               aggregator_function_name,
               specialist_ids,
               ordinal
          FROM v_intent_specialists_active
        """
    )
    bearer_rows = await pool.fetch(
        """
        SELECT specialist_id, agent_type, function_name
          FROM v_intent_specialist_bearers_active
        """
    )

    intents: dict[str, IntentSpec] = {}
    for r in intent_rows:
        raw_specialists = r["specialist_ids"]
        # asyncpg may return JSONB as the native dict/list (default
        # codec) or as a JSON-encoded str. Handle both.
        if isinstance(raw_specialists, str):
            import json

            parsed = json.loads(raw_specialists)
        else:
            parsed = raw_specialists
        specialist_ids: tuple[str, ...] = tuple(str(s) for s in parsed) if parsed else ()
        intents[str(r["intent_type"])] = IntentSpec(
            intent_type=str(r["intent_type"]),
            aggregator_agent_type=str(r["aggregator_agent_type"]),
            aggregator_function_name=str(r["aggregator_function_name"]),
            specialist_ids=specialist_ids,
            ordinal=int(r["ordinal"]),
        )

    bearers: dict[str, SpecialistBearer] = {}
    for r in bearer_rows:
        bearers[str(r["specialist_id"])] = SpecialistBearer(
            specialist_id=str(r["specialist_id"]),
            agent_type=str(r["agent_type"]),
            function_name=str(r["function_name"]),
        )

    _CACHE = IntentGrammar(intents=intents, bearers=bearers)
    return _CACHE


def reset_intent_grammar_cache() -> None:
    """Drop the cached grammar. Used by tests; production restart is the prod path."""
    global _CACHE
    _CACHE = None
