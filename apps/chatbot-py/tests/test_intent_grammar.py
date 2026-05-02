"""Unit tests for app.services.intent_grammar — DB-driven grammar loader."""

from __future__ import annotations

import json
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services import intent_grammar as ig


@pytest.fixture(autouse=True)
def _reset_cache() -> Iterator[None]:
    ig.reset_intent_grammar_cache()
    yield
    ig.reset_intent_grammar_cache()


@pytest.mark.asyncio
async def test_load_assembles_intents_and_bearers_from_pool() -> None:
    pool = MagicMock()
    intent_rows = [
        {
            "intent_type": "zoom",
            "aggregator_agent_type": "regalica",
            "aggregator_function_name": "aggregate_zoom_fail",
            "specialist_ids": ["investigator", "citation"],
            "ordinal": 1,
        },
        {
            "intent_type": "general_help",
            "aggregator_agent_type": "regalica",
            "aggregator_function_name": "aggregate_general_help",
            "specialist_ids": [],
            "ordinal": 8,
        },
    ]
    bearer_rows = [
        {
            "specialist_id": "investigator",
            "agent_type": "investigator",
            "function_name": "analyze_fail",
        },
        {
            "specialist_id": "citation",
            "agent_type": "citation",
            "function_name": "find_regulatory_source",
        },
    ]
    pool.fetch = AsyncMock(side_effect=[intent_rows, bearer_rows])

    grammar = await ig.load_intent_grammar(pool)

    assert grammar.intent_types == frozenset({"zoom", "general_help"})
    assert grammar.intents["zoom"].aggregator_function_name == "aggregate_zoom_fail"
    assert grammar.intents["zoom"].specialist_ids == ("investigator", "citation")
    assert grammar.intents["general_help"].specialist_ids == ()
    assert grammar.bearers["investigator"].function_name == "analyze_fail"
    assert grammar.bearers["citation"].agent_type == "citation"


@pytest.mark.asyncio
async def test_load_decodes_specialist_ids_when_jsonb_returned_as_string() -> None:
    """Cover both asyncpg codecs (native list and JSON-string fallback)."""
    pool = MagicMock()
    intent_rows = [
        {
            "intent_type": "x",
            "aggregator_agent_type": "regalica",
            "aggregator_function_name": "aggregate_x",
            "specialist_ids": json.dumps(["investigator"]),  # str variant
            "ordinal": 99,
        },
    ]
    pool.fetch = AsyncMock(side_effect=[intent_rows, []])
    grammar = await ig.load_intent_grammar(pool)
    assert grammar.intents["x"].specialist_ids == ("investigator",)


@pytest.mark.asyncio
async def test_load_caches_first_call_and_skips_pool_on_second() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=[[], []])
    await ig.load_intent_grammar(pool)
    await ig.load_intent_grammar(pool)
    assert pool.fetch.await_count == 2  # one initial pair (intents + bearers)


@pytest.mark.asyncio
async def test_reset_cache_drops_every_entry() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=[[], []])
    await ig.load_intent_grammar(pool)
    ig.reset_intent_grammar_cache()
    pool.fetch.reset_mock()
    pool.fetch.side_effect = [
        [
            {
                "intent_type": "y",
                "aggregator_agent_type": "regalica",
                "aggregator_function_name": "aggregate_y",
                "specialist_ids": [],
                "ordinal": 50,
            }
        ],
        [],
    ]
    grammar = await ig.load_intent_grammar(pool)
    assert grammar.intent_types == frozenset({"y"})
    assert pool.fetch.await_count == 2


@pytest.mark.asyncio
async def test_intent_types_is_frozen_and_iterable() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(
        side_effect=[
            [
                {
                    "intent_type": "a",
                    "aggregator_agent_type": "regalica",
                    "aggregator_function_name": "aggregate_a",
                    "specialist_ids": [],
                    "ordinal": 1,
                },
                {
                    "intent_type": "b",
                    "aggregator_agent_type": "regalica",
                    "aggregator_function_name": "aggregate_b",
                    "specialist_ids": [],
                    "ordinal": 2,
                },
            ],
            [],
        ]
    )
    grammar = await ig.load_intent_grammar(pool)
    types = grammar.intent_types
    assert isinstance(types, frozenset)
    assert types == frozenset({"a", "b"})
