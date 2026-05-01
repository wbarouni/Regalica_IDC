"""Unit tests for app.clients.regflow_api.RegflowApiClient.

The client signs a fresh JWT per request and POSTs to two engine
endpoints. Tests use httpx.MockTransport to intercept requests
in-process so the suite stays fully offline.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import jwt
import pytest
from app.clients.regflow_api import RegflowApiClient, RegflowApiError
from app.config import settings


@pytest.fixture
def captured() -> dict[str, Any]:
    return {}


def _transport(captured: dict[str, Any], handler) -> httpx.MockTransport:
    async def _async_handler(request: httpx.Request) -> httpx.Response:
        captured["method"] = request.method
        captured["url"] = str(request.url)
        captured["headers"] = {k.lower(): v for k, v in request.headers.items()}
        captured["body"] = json.loads(request.content) if request.content else None
        return handler(request)

    return httpx.MockTransport(_async_handler)


def _make_client(transport: httpx.MockTransport) -> RegflowApiClient:
    http_client = httpx.AsyncClient(
        transport=transport,
        base_url=f"{settings.api_url.rstrip('/')}/api/engine",
    )
    return RegflowApiClient(http_client=http_client)


@pytest.mark.asyncio
async def test_notify_agent_step_signs_jwt_and_posts_canonical_body(
    captured: dict[str, Any],
) -> None:
    transport = _transport(
        captured,
        lambda _r: httpx.Response(
            200,
            json={
                "data": {
                    "id": "00000000-0000-7000-8000-000000000001",
                    "status": "current",
                },
            },
        ),
    )
    client = _make_client(transport)

    result = await client.notify_agent_step(
        run_id="11111111-1111-7111-8111-111111111111",
        step_id="22222222-2222-7222-8222-222222222222",
        tenant_id="33333333-3333-7333-8333-333333333333",
        new_status="current",
        started_at="2026-04-30T10:00:00+00:00",
    )

    assert result["data"]["status"] == "current"
    assert captured["method"] == "POST"
    assert captured["url"].endswith(
        "/api/engine/runs/11111111-1111-7111-8111-111111111111"
        "/agent-steps/22222222-2222-7222-8222-222222222222"
    )
    assert captured["body"] == {
        "status": "current",
        "startedAt": "2026-04-30T10:00:00+00:00",
    }
    auth = captured["headers"]["authorization"]
    assert auth.startswith("Bearer ")
    decoded = jwt.decode(auth.removeprefix("Bearer "), settings.jwt_secret, algorithms=["HS256"])
    assert decoded["role"] == "regflow_engine"
    assert decoded["tenant_id"] == "33333333-3333-7333-8333-333333333333"
    assert decoded["exp"] > decoded["iat"]


@pytest.mark.asyncio
async def test_notify_agent_step_includes_completed_and_error_when_provided(
    captured: dict[str, Any],
) -> None:
    transport = _transport(
        captured,
        lambda _r: httpx.Response(200, json={"data": {"status": "error"}}),
    )
    client = _make_client(transport)
    await client.notify_agent_step(
        run_id="11111111-1111-7111-8111-111111111111",
        step_id="22222222-2222-7222-8222-222222222222",
        tenant_id="33333333-3333-7333-8333-333333333333",
        new_status="error",
        started_at="2026-04-30T10:00:00+00:00",
        completed_at="2026-04-30T10:00:01+00:00",
        error_message="parse failed",
    )
    assert captured["body"] == {
        "status": "error",
        "startedAt": "2026-04-30T10:00:00+00:00",
        "completedAt": "2026-04-30T10:00:01+00:00",
        "errorMessage": "parse failed",
    }


@pytest.mark.asyncio
async def test_persist_message_includes_role_metadata_and_tenant(
    captured: dict[str, Any],
) -> None:
    transport = _transport(
        captured,
        lambda _r: httpx.Response(
            201,
            json={
                "data": {
                    "id": "44444444-4444-7444-8444-444444444444",
                    "sequence_number": 7,
                    "role": "regalica_response",
                },
            },
        ),
    )
    client = _make_client(transport)

    result = await client.persist_message(
        conversation_id="55555555-5555-7555-8555-555555555555",
        tenant_id="33333333-3333-7333-8333-333333333333",
        content="Bonjour, dépôt RSM630 confirmé.",
        metadata={"agents_triggered": ["temporal", "dependency"]},
        produced_by_agent="regalica",
        run_id="11111111-1111-7111-8111-111111111111",
    )

    assert result["data"]["sequence_number"] == 7
    assert captured["url"].endswith(
        "/api/engine/conversations/55555555-5555-7555-8555-555555555555/messages"
    )
    assert captured["body"] == {
        "tenant_id": "33333333-3333-7333-8333-333333333333",
        "role": "assistant",
        "content": "Bonjour, dépôt RSM630 confirmé.",
        "metadata": {"agents_triggered": ["temporal", "dependency"]},
        "produced_by_agent": "regalica",
        "run_id": "11111111-1111-7111-8111-111111111111",
    }


@pytest.mark.asyncio
async def test_engine_api_error_carries_status_and_endpoint(
    captured: dict[str, Any],
) -> None:
    transport = _transport(
        captured,
        lambda _r: httpx.Response(
            403,
            json={"error": {"code": "TENANT_MISMATCH", "message": "drift"}},
        ),
    )
    client = _make_client(transport)
    with pytest.raises(RegflowApiError) as exc_info:
        await client.persist_message(
            conversation_id="55555555-5555-7555-8555-555555555555",
            tenant_id="00000000-0000-0000-0000-000000000000",
            content="ignored",
        )
    err = exc_info.value
    assert err.status_code == 403
    assert "TENANT_MISMATCH" in err.body
    assert err.endpoint.endswith("/messages")


@pytest.mark.asyncio
async def test_aclose_releases_owned_client_only_once() -> None:
    transport = httpx.MockTransport(lambda _r: httpx.Response(200, json={"data": {}}))
    http_client = httpx.AsyncClient(transport=transport, base_url="http://test")
    client = RegflowApiClient(http_client=http_client)
    # When the caller injected the http_client, aclose() must NOT close
    # it (the caller owns its lifecycle).
    await client.aclose()
    assert http_client.is_closed is False
    await http_client.aclose()
