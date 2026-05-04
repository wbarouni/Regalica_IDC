"""Pure tests for RegflowApiClient.finalize_run — retry + correlation_id.

Mocks the underlying httpx.AsyncClient via httpx.MockTransport so no
real network call is made. Asserts:
  * 2xx → returns body, exits the retry loop immediately
  * 4xx → bubbles RegflowApiError without retry (contract bug surface)
  * 5xx → retries with exponential backoff, ultimately raises if all
    attempts return 5xx
  * network error (httpx.HTTPError) → retried, then RegflowApiError
  * X-Correlation-Id header propagated on every attempt
  * payload sent verbatim
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from app.clients.regflow_api import RegflowApiClient, RegflowApiError


def _patched_client(monkeypatch: pytest.MonkeyPatch) -> RegflowApiClient:
    """Build a RegflowApiClient and disable the backoff sleep."""

    async def _no_sleep(_seconds: float) -> None:
        return None

    monkeypatch.setattr("app.clients.regflow_api._sleep_seconds", _no_sleep)
    return RegflowApiClient()


def _settings_signing_workaround(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stub the JWT signing path so we don't need real settings."""

    def _fake_sign(_tenant_id: str) -> str:
        return "stub-token"

    monkeypatch.setattr("app.clients.regflow_api._sign_engine_jwt", _fake_sign)


@pytest.mark.asyncio
async def test_2xx_returns_body_on_first_attempt(monkeypatch: pytest.MonkeyPatch) -> None:
    _settings_signing_workaround(monkeypatch)
    captured: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(200, json={"data": {"run_id": "abc", "idempotent": True}})

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport, base_url="http://engine.test")
    client = RegflowApiClient(http_client=http_client)

    result = await client.finalize_run(
        run_id="aaaaaaaa-1111-7111-8111-111111111111",
        tenant_id="bbbbbbbb-1111-7111-8111-111111111111",
        payload={"status": "completed"},
        correlation_id="cccccccc-1111-4111-8111-111111111111",
    )
    await client.aclose()

    assert result == {"data": {"run_id": "abc", "idempotent": True}}
    assert len(captured) == 1
    assert captured[0].headers["X-Correlation-Id"] == "cccccccc-1111-4111-8111-111111111111"
    assert json.loads(captured[0].content.decode()) == {"status": "completed"}


@pytest.mark.asyncio
async def test_4xx_bubbles_without_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    _settings_signing_workaround(monkeypatch)
    monkeypatch.setattr("app.clients.regflow_api._sleep_seconds", lambda _s: None)
    attempts = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(422, text='{"error":{"code":"INVALID_FINALIZE_BODY"}}')

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport, base_url="http://engine.test")
    client = RegflowApiClient(http_client=http_client)

    with pytest.raises(RegflowApiError) as excinfo:
        await client.finalize_run(
            run_id="aaaaaaaa-1111-7111-8111-111111111111",
            tenant_id="bbbbbbbb-1111-7111-8111-111111111111",
            payload={"status": "completed"},
            retry_max=3,
        )
    await client.aclose()

    assert excinfo.value.status_code == 422
    # 4xx must NOT trigger retries.
    assert attempts == 1


@pytest.mark.asyncio
async def test_5xx_retries_then_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    _settings_signing_workaround(monkeypatch)

    sleeps: list[float] = []

    async def _spy_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    monkeypatch.setattr("app.clients.regflow_api._sleep_seconds", _spy_sleep)

    attempts = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(503, text="upstream down")

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport, base_url="http://engine.test")
    client = RegflowApiClient(http_client=http_client)

    with pytest.raises(RegflowApiError) as excinfo:
        await client.finalize_run(
            run_id="aaaaaaaa-1111-7111-8111-111111111111",
            tenant_id="bbbbbbbb-1111-7111-8111-111111111111",
            payload={"status": "completed"},
            retry_max=3,
            retry_backoff_seconds=(0.1, 0.2),
        )
    await client.aclose()

    assert excinfo.value.status_code == 503
    assert attempts == 3
    assert sleeps == [0.1, 0.2]


@pytest.mark.asyncio
async def test_network_error_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    _settings_signing_workaround(monkeypatch)

    async def _no_sleep(_s: float) -> None:
        return None

    monkeypatch.setattr("app.clients.regflow_api._sleep_seconds", _no_sleep)

    attempts = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts < 2:
            raise httpx.ConnectError("simulated network down")
        return httpx.Response(200, json={"data": {"idempotent": False}})

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport, base_url="http://engine.test")
    client = RegflowApiClient(http_client=http_client)

    result: dict[str, Any] = await client.finalize_run(
        run_id="aaaaaaaa-1111-7111-8111-111111111111",
        tenant_id="bbbbbbbb-1111-7111-8111-111111111111",
        payload={"status": "completed"},
        retry_max=3,
        retry_backoff_seconds=(0.0, 0.0),
    )
    await client.aclose()

    assert attempts == 2
    assert result["data"]["idempotent"] is False


@pytest.mark.asyncio
async def test_correlation_id_propagated_on_every_attempt(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _settings_signing_workaround(monkeypatch)

    async def _no_sleep(_s: float) -> None:
        return None

    monkeypatch.setattr("app.clients.regflow_api._sleep_seconds", _no_sleep)

    seen: list[str] = []
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        seen.append(request.headers["X-Correlation-Id"])
        if attempts < 3:
            return httpx.Response(503, text="busy")
        return httpx.Response(200, json={"data": {}})

    transport = httpx.MockTransport(handler)
    http_client = httpx.AsyncClient(transport=transport, base_url="http://engine.test")
    client = RegflowApiClient(http_client=http_client)

    await client.finalize_run(
        run_id="aaaaaaaa-1111-7111-8111-111111111111",
        tenant_id="bbbbbbbb-1111-7111-8111-111111111111",
        payload={},
        correlation_id="dddddddd-1111-4111-8111-111111111111",
        retry_max=5,
        retry_backoff_seconds=(0.0, 0.0, 0.0, 0.0),
    )
    await client.aclose()

    assert attempts == 3
    # All three attempts MUST share the same correlation_id so the
    # server-side canonical idempotence works on retries.
    assert seen == ["dddddddd-1111-4111-8111-111111111111"] * 3
