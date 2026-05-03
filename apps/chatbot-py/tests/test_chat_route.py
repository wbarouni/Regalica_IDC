"""Unit tests for POST /chat/message — mocked pool and LLM client.

The route delegates to `app.services.orchestrator.orchestrate()`,
which loads the `regalica/router` prompt + the specialist prompt
from `prompt_bank` and invokes the appropriate T2 agent. Each
piece is mocked with `AsyncMock` so the test suite stays purely
in-process: no DB, no network.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.main import app
from app.routes.chat import get_llm_client, get_pool
from app.services import intent_grammar as ig
from app.services import platform_config as pc
from fastapi import status
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _seed_intent_grammar_cache() -> Iterator[None]:
    """Pre-populate the intent grammar cache (mirror migration 065 + 066).

    The orchestrator now loads the dispatch grammar from
    `v_intent_specialists_active` + `v_intent_specialist_bearers_active`
    via `intent_grammar.load_intent_grammar`. Without this fixture the
    loader would hit `mock_pool.fetch` (returns `[]` by default) and
    every chat turn would short-circuit to the no-router fallback.
    Seeding the cache mirrors the production state and keeps the spec
    bodies focused on the orchestrator pipeline.

    Also pre-seeds `platform_config._CACHE` with an EMPTY planner
    trigger list so the conditional planner step (commit C10/2)
    never fires in chat-route specs — those tests exercise the
    canonical dispatch path. Planner-specific behaviour is covered
    by test_orchestrator_planner.py.
    """
    ig.reset_intent_grammar_cache()
    pc.reset_platform_config_cache()
    pc._CACHE["regalica_planner_trigger_intents"] = []
    pc._CACHE["regalica_planner_max_plan_steps"] = 4
    ig._CACHE = ig.IntentGrammar(
        intents={
            "general_help": ig.IntentSpec(
                intent_type="general_help",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_general_help",
                specialist_ids=(),
                ordinal=8,
            ),
            "zoom": ig.IntentSpec(
                intent_type="zoom",
                aggregator_agent_type="regalica",
                aggregator_function_name="aggregate_zoom_fail",
                specialist_ids=("investigator", "citation"),
                ordinal=1,
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
    pc.reset_platform_config_cache()


def _llm_response(content: str) -> LLMResponse:
    return LLMResponse(
        content=content,
        thinking_trace=None,
        tokens_input=42,
        tokens_output=18,
        tokens_thinking=7,
        latency_ms=123,
        model_used="gemini-2.5-flash",
    )


def _prompt_row(template: str = "[TEMPLATE]") -> dict[str, object]:
    return {
        "template": template,
        "temperature": 0.7,
        "max_tokens": 4096,
        "thinking_enabled": True,
        "target_model": "gemini-2.5-flash",
        # Aggregator default per migration 069 backfill convention
        # (regalica/aggregate_* → string). Tests that exercise non-
        # aggregator prompts (router, investigator, …) override below
        # via _prompt_row_json.
        "output_contract": "string",
        # Migration 070 fields — None / 'standard' default mirrors what
        # load_active_prompt sees when the row was seeded by 043 and
        # not yet touched by 070-B/C.
        "static_response": None,
        "model_tier": "standard",
    }


@pytest.fixture
def mock_pool() -> MagicMock:
    """Return a MagicMock pool with AsyncMock-backed query methods."""
    pool = MagicMock()
    pool.fetchrow = AsyncMock()
    pool.fetch = AsyncMock(return_value=[])
    return pool


@pytest.fixture
def mock_llm() -> MagicMock:
    """Return a MagicMock LLM client whose `complete` is configured per test."""
    client = MagicMock()
    client.complete = AsyncMock()
    return client


@pytest.fixture
def client(mock_pool: MagicMock, mock_llm: MagicMock) -> Iterator[TestClient]:
    """Yield a TestClient with `get_pool` and `get_llm_client` overridden."""
    app.dependency_overrides[get_pool] = lambda: mock_pool
    app.dependency_overrides[get_llm_client] = lambda: mock_llm
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _valid_request_payload() -> dict[str, object]:
    return {
        "message": "Pourquoi la règle 139/r3 a-t-elle échoué ?",
        "tenant_id": "00000000-0000-0000-0000-000000000001",
        "user_id": "00000000-0000-0000-0000-000000000002",
    }


def test_post_chat_message_dispatches_through_orchestrator_and_returns_200(
    client: TestClient, mock_pool: MagicMock, mock_llm: MagicMock
) -> None:
    """Router -> general_help -> 200 with canonical ChatResponse."""
    mock_pool.fetchrow.side_effect = [
        _prompt_row("[REGALICA_ROUTER_V1]"),  # router prompt
        _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),  # specialist prompt
        {"id": "00000000-0000-0000-0000-0000000000aa"},  # _ensure_conversation
        {"next_seq": 1},  # _persist_message SELECT MAX
        {"id": "00000000-0000-0000-0000-0000000000bb"},  # _persist_message INSERT
    ]
    mock_llm.complete.side_effect = [
        _llm_response(json.dumps({"intent": "general_help", "confidence": 0.7})),  # router
        _llm_response("Bonjour, je suis Regalica."),  # specialist (general_help path)
    ]

    response = client.post("/chat/message", json=_valid_request_payload())

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["conversation_id"] == "00000000-0000-0000-0000-0000000000aa"
    assert body["message_id"] == "00000000-0000-0000-0000-0000000000bb"
    assert body["response_markdown"] == "Bonjour, je suis Regalica."
    assert body["agents_called"] == ["regalica/aggregate_general_help"]
    assert body["thinking_trace"].startswith("L'utilisateur demande")
    assert "general_help" in body["thinking_trace"]
    # Tokens come from the specialist (general_help) LLM response, not the router.
    assert body["tokens_input"] == 42
    assert body["tokens_output"] == 18
    assert body["tokens_thinking"] == 7


def test_post_chat_message_rejects_empty_message(client: TestClient) -> None:
    payload = _valid_request_payload()
    payload["message"] = ""
    response = client.post("/chat/message", json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_post_chat_message_returns_fallback_when_router_prompt_missing(
    client: TestClient, mock_pool: MagicMock, mock_llm: MagicMock
) -> None:
    """No active router prompt → orchestrator emits the fallback message."""
    mock_pool.fetchrow.side_effect = [
        None,  # router prompt absent
        {"id": "00000000-0000-0000-0000-0000000000cc"},  # conv insert
        {"next_seq": 1},
        {"id": "00000000-0000-0000-0000-0000000000dd"},  # msg insert
    ]

    response = client.post("/chat/message", json=_valid_request_payload())

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert "Aucun prompt actif" in body["response_markdown"]
    assert "regalica/router" in body["response_markdown"]
    assert body["agents_called"] == []
    assert body["tokens_input"] == 0
    assert body["tokens_output"] == 0
    assert body["tokens_thinking"] == 0
    mock_llm.complete.assert_not_awaited()


def test_post_chat_message_absorbs_llm_failure_in_general_help_path(
    client: TestClient, mock_pool: MagicMock, mock_llm: MagicMock
) -> None:
    """LLM raising on every call still returns 200 with an error markdown.

    The router LLM call fails -> detect_intent falls back to 'general_help'.
    The specialist (general_help) LLM call also fails -> _direct_response
    surfaces the error inside response_markdown so the user gets a
    coherent answer instead of a 5xx.
    """
    mock_pool.fetchrow.side_effect = [
        _prompt_row("[REGALICA_ROUTER_V1]"),
        _prompt_row("[REGALICA_AGGREGATE_GENERAL_HELP_V1]"),
        {"id": "00000000-0000-0000-0000-0000000000ee"},
        {"next_seq": 1},
        {"id": "00000000-0000-0000-0000-0000000000ff"},
    ]
    mock_llm.complete.side_effect = RuntimeError("upstream LLM rate limited")

    response = client.post("/chat/message", json=_valid_request_payload())

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert "Erreur LLM" in body["response_markdown"]
    assert "rate limited" in body["response_markdown"]
    assert body["agents_called"] == ["regalica/aggregate_general_help"]


def test_post_chat_message_503_when_pool_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """get_pool reads app.state.db_pool; force it to None to assert the 503.

    The TestClient runs the FastAPI lifespan, which creates a real pool
    when DATABASE_URL is set in the test environment. We patch the
    state attribute back to None AFTER startup but BEFORE the request
    fires — get_pool reads the attribute at request time, so the route
    handler sees a missing pool regardless of the local environment.
    """
    app.dependency_overrides.clear()
    app.dependency_overrides[get_llm_client] = lambda: MagicMock()
    with TestClient(app) as c:
        monkeypatch.setattr(app.state, "db_pool", None, raising=False)
        response = c.post("/chat/message", json=_valid_request_payload())
    app.dependency_overrides.clear()
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "DB pool not initialised" in response.json()["detail"]
