"""Unit tests for POST /chat/message — mocked pool and LLM client.

The route reads the active prompt from `prompt_bank` via
`load_active_prompt`, delegates to `LLMClient.complete()`, and
persists the conversation + message in Postgres. Each piece is
mocked with `AsyncMock` so the test suite stays purely
in-process: no DB, no network.
"""

from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.llm.base import LLMResponse
from app.main import app
from app.routes.chat import get_llm_client, get_pool
from fastapi import status
from fastapi.testclient import TestClient


def _llm_response_fixture() -> LLMResponse:
    return LLMResponse(
        content="Voici la réponse de Regalica.",
        thinking_trace="raisonnement intermédiaire",
        tokens_input=42,
        tokens_output=18,
        tokens_thinking=7,
        latency_ms=123,
        model_used="gemini-2.5-flash",
    )


def _prompt_row_fixture() -> dict[str, object]:
    return {
        "template": "Vous êtes Regalica. Répondez en français.",
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
    return pool


@pytest.fixture
def mock_llm() -> MagicMock:
    """Return a MagicMock LLM client whose `complete` returns a fixture."""
    client = MagicMock()
    client.complete = AsyncMock(return_value=_llm_response_fixture())
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


def test_post_chat_message_returns_200_and_canonical_response(
    client: TestClient, mock_pool: MagicMock, mock_llm: MagicMock
) -> None:
    mock_pool.fetchrow.side_effect = [
        _prompt_row_fixture(),  # load_active_prompt
        {"id": "00000000-0000-0000-0000-0000000000aa"},  # _ensure_conversation INSERT
        {"next_seq": 1},  # _persist_message SELECT MAX
        {"id": "00000000-0000-0000-0000-0000000000bb"},  # _persist_message INSERT
    ]

    response = client.post("/chat/message", json=_valid_request_payload())

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["conversation_id"] == "00000000-0000-0000-0000-0000000000aa"
    assert body["message_id"] == "00000000-0000-0000-0000-0000000000bb"
    assert body["response_markdown"] == "Voici la réponse de Regalica."
    assert body["thinking_trace"] == "raisonnement intermédiaire"
    assert body["agents_called"] == ["regalica/aggregate_zoom_fail"]
    assert body["tokens_input"] == 42
    assert body["tokens_output"] == 18
    assert body["tokens_thinking"] == 7
    assert body["latency_ms"] == 123
    mock_llm.complete.assert_awaited_once()


def test_post_chat_message_rejects_empty_message(client: TestClient) -> None:
    payload = _valid_request_payload()
    payload["message"] = ""
    response = client.post("/chat/message", json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_post_chat_message_returns_fallback_when_no_active_prompt(
    client: TestClient, mock_pool: MagicMock, mock_llm: MagicMock
) -> None:
    mock_pool.fetchrow.side_effect = [
        None,  # load_active_prompt: no active prompt
        {"id": "00000000-0000-0000-0000-0000000000cc"},  # _ensure_conversation
        {"next_seq": 1},  # _persist_message SELECT MAX
        {"id": "00000000-0000-0000-0000-0000000000dd"},  # _persist_message INSERT
    ]

    response = client.post("/chat/message", json=_valid_request_payload())

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert "Aucun prompt actif" in body["response_markdown"]
    assert body["agents_called"] == []
    assert body["tokens_input"] == 0
    assert body["tokens_output"] == 0
    assert body["tokens_thinking"] == 0
    mock_llm.complete.assert_not_awaited()


def test_post_chat_message_returns_500_when_llm_fails(
    client: TestClient, mock_pool: MagicMock, mock_llm: MagicMock
) -> None:
    mock_pool.fetchrow.side_effect = [
        _prompt_row_fixture(),  # load_active_prompt
    ]
    mock_llm.complete.side_effect = RuntimeError("upstream LLM rate limited")

    response = client.post("/chat/message", json=_valid_request_payload())

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    body = response.json()
    assert "LLM completion failed" in body["detail"]
    assert "rate limited" in body["detail"]


def test_post_chat_message_503_when_pool_missing() -> None:
    """Without overrides, get_pool reads app.state.db_pool which is unset."""
    app.dependency_overrides.clear()
    # Override only the LLM client so the failure is the pool one.
    app.dependency_overrides[get_llm_client] = lambda: MagicMock()
    with TestClient(app) as c:
        response = c.post("/chat/message", json=_valid_request_payload())
    app.dependency_overrides.clear()
    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    assert "DB pool not initialised" in response.json()["detail"]
