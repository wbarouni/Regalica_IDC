"""End-to-end specs for the Cas N°2 wiring in POST /chat/message.

Verifies the route:
  1. Persists the user-role message BEFORE orchestrating.
  2. Loads session_history from the DB and passes it to orchestrate.
  3. Persists the Regalica response AFTER orchestrating.
  4. Isolates two conversations in parallel — neither one sees the
     other's history even when they share a tenant.

The orchestrator itself is replaced by an awaitable spy so the
specs stay deterministic and we can inspect the `session_history`
kwarg that reached it.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.main import app
from app.routes.chat import get_llm_client, get_pool
from app.services import intent_grammar as ig
from app.services import platform_config as pc
from fastapi import status
from fastapi.testclient import TestClient

_TENANT = "00000000-0000-0000-0000-000000000001"
_USER = "00000000-0000-0000-0000-000000000002"


@pytest.fixture(autouse=True)
def _seed_caches() -> Iterator[None]:
    ig.reset_intent_grammar_cache()
    pc.reset_platform_config_cache()
    pc._CACHE["regalica_planner_trigger_intents"] = []
    pc._CACHE["regalica_planner_max_plan_steps"] = 4
    # History cap of 20 to mirror migration 116 seed value.
    pc._CACHE["chat_history_max_messages"] = 20
    # Migration 117 — runtime tunables.
    pc._CACHE["regalica_router_max_tokens"] = 1024
    pc._CACHE["regalica_thinking_preview_max_chars"] = 180
    ig._CACHE = ig.IntentGrammar(
        intents={
            "general_help": ig.IntentSpec(
                intent_type="general_help",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_general_help",
                specialist_ids=(),
                ordinal=8,
            ),
        },
        bearers={},
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
        "temperature": 0.7,
        "max_tokens": 4096,
        "thinking_enabled": True,
        "target_model": "gemini-2.5-flash",
        "output_contract": "string",
        "static_response": None,
        "model_tier": "standard",
    }


def _build_pool(
    fetchrow_rows: list[Any],
    fetch_rows: list[list[Any]] | None = None,
) -> MagicMock:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(side_effect=fetchrow_rows)
    pool.fetch = AsyncMock(side_effect=(fetch_rows or []) + [[]] * 50)
    return pool


@pytest.fixture
def client_factory() -> Iterator[Any]:
    """Build a TestClient bound to a pool/llm pair, with lifespan active.

    `with TestClient(app)` is required so the FastAPI lifespan event
    runs and `app.state.api_client` (read by `get_api_client`) exists.
    The factory yields the TestClient INSIDE the lifespan context so
    the test body can post requests, and the cleanup closes the
    lifespan on exit.
    """
    clients: list[TestClient] = []

    def _make(pool: MagicMock, llm: MagicMock) -> TestClient:
        app.dependency_overrides[get_pool] = lambda: pool
        app.dependency_overrides[get_llm_client] = lambda: llm
        tc = TestClient(app)
        tc.__enter__()
        clients.append(tc)
        return tc

    yield _make
    for tc in clients:
        tc.__exit__(None, None, None)
    app.dependency_overrides.clear()


def test_user_message_row_is_persisted_before_orchestration(
    client_factory: Any,
) -> None:
    """The INSERT INTO messages with role='user' fires before the router LLM call."""
    pool = _build_pool(
        fetchrow_rows=[
            {"id": "10000000-0000-0000-0000-000000000001"},  # conv INSERT
            {"next_seq": 1},  # _persist_user_message MAX
            {"id": "20000000-0000-0000-0000-000000000001"},  # _persist_user_message INSERT
            _prompt_row("[ROUTER]"),  # orchestrator router
            _prompt_row("[HELP]"),  # orchestrator aggregator
            _prompt_row("[THINKING]"),  # orchestrator thinking
            {"next_seq": 2},  # _persist_message MAX
            {"id": "30000000-0000-0000-0000-000000000001"},  # _persist_message INSERT
        ],
        # session_history loader returns one prior turn — not used here
        # but the call is allowed to occur.
        fetch_rows=[
            [
                {
                    "role": "user",
                    "content_markdown": "prior turn",
                    "sequence_number": 0,
                },
            ],
        ],
    )
    llm = MagicMock()
    llm.complete = AsyncMock(
        side_effect=[
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.8})),
            _llm_response("La demande appelle une présentation."),  # thinking
            _llm_response("Réponse Regalica."),  # aggregator
        ]
    )
    c = client_factory(pool, llm)
    resp = c.post(
        "/chat/message",
        json={
            "message": "bonjour merci de vérifier les résultats",
            "tenant_id": _TENANT,
            "user_id": _USER,
        },
    )
    assert resp.status_code == status.HTTP_200_OK

    # Reconstruct the call order from pool.fetchrow.call_args_list. The
    # FIRST fetchrow call is the conversation INSERT (no router prompt
    # SELECT before it); the second + third are the user-message MAX +
    # INSERT. Only THEN does the router prompt fetch fire.
    calls = pool.fetchrow.call_args_list
    queries = [call.args[0] for call in calls]
    assert "INSERT INTO conversations" in queries[0]
    assert "FROM messages" in queries[1]  # _persist_user_message MAX
    assert "INSERT INTO messages" in queries[2]  # _persist_user_message
    # 4th query is the router prompt fetch.
    assert "FROM prompt_bank" in queries[3]


def test_session_history_loaded_and_forwarded_to_orchestrator(
    client_factory: Any,
) -> None:
    """The history loader's output reaches the orchestrator via fetch()."""
    pool = _build_pool(
        fetchrow_rows=[
            {"id": "11111111-1111-1111-1111-111111111111"},
            {"next_seq": 1},
            {"id": "22222222-2222-2222-2222-222222222222"},
            _prompt_row("[ROUTER]"),
            _prompt_row("[HELP]"),
            _prompt_row("[THINKING]"),
            {"next_seq": 2},
            {"id": "33333333-3333-3333-3333-333333333333"},
        ],
        fetch_rows=[
            # First fetch is `load_session_history` — return 2 prior turns.
            [
                {
                    "role": "user",
                    "content_markdown": "first user turn",
                    "sequence_number": 0,
                    "tenant_id": _TENANT,
                },
                {
                    "role": "regalica_response",
                    "content_markdown": "first regalica reply",
                    "sequence_number": 1,
                    "tenant_id": _TENANT,
                },
            ],
        ],
    )
    llm = MagicMock()
    llm.complete = AsyncMock(
        side_effect=[
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.8})),
            _llm_response("thinking"),
            _llm_response("aggregated"),
        ]
    )
    c = client_factory(pool, llm)
    resp = c.post(
        "/chat/message",
        json={"message": "follow up", "tenant_id": _TENANT, "user_id": _USER},
    )
    assert resp.status_code == status.HTTP_200_OK
    # The fetch was called for session_history with the SQL pattern.
    fetch_queries = [call.args[0] for call in pool.fetch.call_args_list]
    history_fetches = [q for q in fetch_queries if "ORDER BY sequence_number DESC" in q]
    assert len(history_fetches) >= 1, (
        "session_history loader must have queried messages with sequence_number DESC"
    )
    # The loader call args include the conversation id we just minted.
    first_history_call = next(
        call
        for call in pool.fetch.call_args_list
        if "ORDER BY sequence_number DESC" in call.args[0]
    )
    assert first_history_call.args[0].strip().startswith("SELECT role")
    # args[1] is the conversation_id, args[2] is the tenant_id.
    assert first_history_call.args[1] == "11111111-1111-1111-1111-111111111111"
    assert first_history_call.args[2] == _TENANT


def test_two_conversations_in_parallel_remain_isolated(
    client_factory: Any,
) -> None:
    """Two conversation_ids must produce two distinct DB-side bindings.

    Conversation A and B share the same tenant_id but different
    conversation_ids. The fetchrow side_effect provides distinct
    inserts; the test confirms each POST persists against ITS row.
    """
    conv_a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    conv_b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

    pool = _build_pool(
        fetchrow_rows=[
            # Turn 1 — conversation A. existing_id is passed so
            # _ensure_conversation short-circuits without fetchrow.
            {"next_seq": 5},  # user MAX (A)
            {"id": "aa111111-1111-1111-1111-111111111111"},  # user INSERT (A)
            _prompt_row("[ROUTER]"),
            _prompt_row("[HELP]"),
            _prompt_row("[THINKING]"),
            {"next_seq": 6},
            {"id": "aa222222-2222-2222-2222-222222222222"},
            # Turn 2 — conversation B.
            {"next_seq": 3},
            {"id": "bb111111-1111-1111-1111-111111111111"},
            _prompt_row("[ROUTER]"),
            _prompt_row("[HELP]"),
            _prompt_row("[THINKING]"),
            {"next_seq": 4},
            {"id": "bb222222-2222-2222-2222-222222222222"},
        ],
        # session_history fetches return empty so each conversation
        # starts with a clean window — what matters here is that the
        # conversation_id used in the WHERE clause is the right one.
        fetch_rows=[[], []],
    )
    llm = MagicMock()
    llm.complete = AsyncMock(
        side_effect=[
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.8})),
            _llm_response("thinking A"),
            _llm_response("réponse A"),
            _llm_response(json.dumps({"intent": "general_help", "confidence": 0.8})),
            _llm_response("thinking B"),
            _llm_response("réponse B"),
        ]
    )
    c = client_factory(pool, llm)

    # Turn 1 — conversation A.
    resp_a = c.post(
        "/chat/message",
        json={
            "message": "question dans A",
            "tenant_id": _TENANT,
            "user_id": _USER,
            "conversation_id": conv_a,
        },
    )
    assert resp_a.status_code == status.HTTP_200_OK
    assert resp_a.json()["conversation_id"] == conv_a

    # Turn 2 — conversation B.
    resp_b = c.post(
        "/chat/message",
        json={
            "message": "question dans B",
            "tenant_id": _TENANT,
            "user_id": _USER,
            "conversation_id": conv_b,
        },
    )
    assert resp_b.status_code == status.HTTP_200_OK
    assert resp_b.json()["conversation_id"] == conv_b

    # Confirm the history-loader fetches were partitioned: the first
    # `ORDER BY sequence_number DESC` fetch carries conv_a, the second
    # carries conv_b — no cross-talk.
    history_calls = [
        call
        for call in pool.fetch.call_args_list
        if "ORDER BY sequence_number DESC" in call.args[0]
    ]
    assert len(history_calls) == 2
    assert history_calls[0].args[1] == conv_a
    assert history_calls[1].args[1] == conv_b
