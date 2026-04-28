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
from fastapi import status
from fastapi.testclient import TestClient


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
        _llm_response(json.dumps({"intent_type": "general_help", "confidence": 0.7})),  # router
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


def test_post_chat_message_503_when_pool_missing() -> None:
    """Without overrides, get_pool reads app.state.db_pool which is unset."""
    app.dependency_overrides.clear()
    app.dependency_overrides[get_llm_client] = lambda: MagicMock()
    with TestClient(app) as c:
        response = c.post("/chat/message", json=_valid_request_payload())
    app.dependency_overrides.clear()
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "DB pool not initialised" in response.json()["detail"]
