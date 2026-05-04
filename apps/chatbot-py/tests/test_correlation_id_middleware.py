"""Pure tests for app.middleware.correlation_id.

Boots a minimal FastAPI app with the middleware mounted, exercises
the round-trip via httpx.AsyncClient (TestClient), and asserts:
  * absent header → fresh UUID v4 generated, echoed in response
  * well-formed v4 header → preserved verbatim (lowercased)
  * well-formed UPPERCASE v4 → lowercased
  * UUID v7 (timestamp-bearing) → rejected, fresh UUID generated
  * malformed header → rejected, fresh UUID generated
  * structlog contextvars carries correlation_id during the request
"""

from __future__ import annotations

import re
import uuid
from typing import cast

import pytest
import structlog
from app.middleware.correlation_id import (
    CORRELATION_ID_HEADER,
    CorrelationIdMiddleware,
)
from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

_UUID_V4_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
)


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(CorrelationIdMiddleware)

    @app.get("/echo")
    async def echo(request: Request) -> dict[str, str]:
        return {
            "correlation_id_state": cast(str, request.state.correlation_id),
            "ctxvar": cast(
                str,
                structlog.contextvars.get_contextvars().get("correlation_id", ""),
            ),
        }

    return app


@pytest.fixture
def client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=_build_app()), base_url="http://test")


@pytest.mark.asyncio
async def test_generates_uuid_v4_when_header_absent(client: AsyncClient) -> None:
    async with client:
        response = await client.get("/echo")
    assert response.status_code == 200
    corr = response.headers[CORRELATION_ID_HEADER]
    assert _UUID_V4_RE.match(corr) is not None
    body = response.json()
    assert body["correlation_id_state"] == corr
    assert body["ctxvar"] == corr


@pytest.mark.asyncio
async def test_preserves_well_formed_v4_lowercased(client: AsyncClient) -> None:
    valid_v4 = "00000000-1111-4222-8333-444444444444"
    async with client:
        response = await client.get("/echo", headers={CORRELATION_ID_HEADER: valid_v4})
    assert response.headers[CORRELATION_ID_HEADER] == valid_v4
    assert response.json()["correlation_id_state"] == valid_v4


@pytest.mark.asyncio
async def test_lowercases_uppercase_v4(client: AsyncClient) -> None:
    upper_v4 = "AAAAAAAA-1111-4222-8333-444444444444"
    async with client:
        response = await client.get("/echo", headers={CORRELATION_ID_HEADER: upper_v4})
    assert response.headers[CORRELATION_ID_HEADER] == upper_v4.lower()


@pytest.mark.asyncio
async def test_rejects_uuid_v7_and_regenerates(client: AsyncClient) -> None:
    # UUID v7 (variant 7, ordered timestamp prefix) leaks server clock
    # info — middleware MUST reject it.
    v7 = "aaaaaaaa-1111-7111-8111-111111111111"
    async with client:
        response = await client.get("/echo", headers={CORRELATION_ID_HEADER: v7})
    corr = response.headers[CORRELATION_ID_HEADER]
    assert corr != v7
    assert _UUID_V4_RE.match(corr) is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "malformed",
    ["not-a-uuid", "12345", "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz", "x"],
)
async def test_regenerates_on_malformed_header(client: AsyncClient, malformed: str) -> None:
    async with client:
        response = await client.get("/echo", headers={CORRELATION_ID_HEADER: malformed})
    corr = response.headers[CORRELATION_ID_HEADER]
    assert corr != malformed
    assert _UUID_V4_RE.match(corr) is not None


@pytest.mark.asyncio
async def test_contextvar_unbound_after_request() -> None:
    """structlog contextvar MUST NOT leak across requests."""
    app = _build_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await ac.get("/echo")
    # Outside the request lifecycle, the contextvar should be cleared.
    assert structlog.contextvars.get_contextvars().get("correlation_id") is None


@pytest.mark.asyncio
async def test_uuid_uniqueness_across_requests(client: AsyncClient) -> None:
    async with client:
        r1 = await client.get("/echo")
        r2 = await client.get("/echo")
    assert r1.headers[CORRELATION_ID_HEADER] != r2.headers[CORRELATION_ID_HEADER]


def test_uuid_module_actually_emits_v4() -> None:
    # Sanity: the stdlib uuid.uuid4() output matches the regex used
    # by the middleware's acceptance check. Guards against a future
    # breaking change in either side.
    for _ in range(50):
        assert _UUID_V4_RE.match(str(uuid.uuid4())) is not None
