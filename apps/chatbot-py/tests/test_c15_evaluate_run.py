"""C15 contract tests — RegflowApiClient.evaluate_run().

Drive the new POST /api/engine/runs/<run>/evaluate route shipped in
C14. Mocks the upstream HTTP call via httpx.MockTransport (mirrors
the existing tests/test_regflow_api_client.py pattern).

Coverage:
  - C15-A : happy path — full envelope mapping, severity preserved,
            Decimal columns kept as strings, body carries arrete_date
            only (no XML), Authorization header signed by the engine
            JWT helper, URL targets the canonical endpoint.
  - C15-B : error paths — 401/500 surface as EvaluationError with
            status_code; httpx.TimeoutException surfaces as
            EvaluationTimeoutError carrying run_id + timeout_seconds;
            EvaluationTimeoutError is a subclass of EvaluationError so
            a single `except EvaluationError` catches both.
  - C15-C : refactor sanity — _engine_auth_headers helper produces
            the canonical {Authorization, Content-Type} dict.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from app.clients.regflow_api import (
    EvaluateRunResult,
    RegflowApiClient,
)
from app.config import settings
from app.exceptions import EvaluationError, EvaluationTimeoutError

# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

_TENANT_ID = "bbbbbbbb-0000-7000-8000-000000000001"
_RUN_ID = "aaaaaaaa-0000-7000-8000-000000000001"

_VALID_C14_BODY: dict[str, Any] = {
    "data": {
        "run_id": _RUN_ID,
        "arrete_date": "2026-02-28",
        "evaluated_at": "2026-05-03T10:00:00.000Z",
        "duration_ms": 1250,
        "verdicts": [
            {
                "ax_term": "630",
                "num_regle": 266,
                "status": "FAIL",
                "severity": "BLOQUANT",
                "lhs": "185691.000",
                "rhs": "185648.000",
                "gap": "43.000",
                "gap_relative": 0.23,
            },
            {
                "ax_term": "630",
                "num_regle": 267,
                "status": "PASS",
                "severity": None,
                "lhs": "100000.000",
                "rhs": "100000.000",
                "gap": "0.000",
                "gap_relative": 0.0,
            },
        ],
        "totals": {
            "pass": 937,
            "fail_severe": 1,
            "fail_rounding": 0,
            "skipped_missing_annexe": 100,
            "skipped_missing_rubrique": 0,
            "skipped_missing_colonne": 0,
            "skipped_missing_data": 0,
            "skipped_conditional": 0,
            "skipped_unsupported_op": 0,
            "skipped_literal_text": 0,
            "rules_applicable_total": 4611,
        },
    },
    "meta": {"ts": "2026-05-03T10:00:00.000Z", "version": "1"},
}


@pytest.fixture
def captured() -> dict[str, Any]:
    return {}


def _transport(captured: dict[str, Any], handler: Any) -> httpx.MockTransport:
    """Capture method/url/headers/body of every request before delegating
    to the supplied handler. Mirrors test_regflow_api_client.py.
    """

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


# ---------------------------------------------------------------------------
# C15-A — happy path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_run_returns_full_envelope_on_200(captured: dict[str, Any]) -> None:
    transport = _transport(captured, lambda _r: httpx.Response(200, json=_VALID_C14_BODY))
    client = _make_client(transport)

    result: EvaluateRunResult = await client.evaluate_run(
        run_id=_RUN_ID,
        tenant_id=_TENANT_ID,
        arrete_date="2026-02-28",
    )

    assert result["run_id"] == _RUN_ID
    assert result["arrete_date"] == "2026-02-28"
    assert result["duration_ms"] == 1250
    assert result["totals"]["pass_"] == 937
    assert result["totals"]["fail_severe"] == 1
    assert result["totals"]["rules_applicable_total"] == 4611


@pytest.mark.asyncio
async def test_evaluate_run_preserves_decimal_strings(captured: dict[str, Any]) -> None:
    transport = _transport(captured, lambda _r: httpx.Response(200, json=_VALID_C14_BODY))
    client = _make_client(transport)

    result = await client.evaluate_run(
        run_id=_RUN_ID, tenant_id=_TENANT_ID, arrete_date="2026-02-28"
    )

    first = result["verdicts"][0]
    assert isinstance(first["lhs"], str)
    assert first["lhs"] == "185691.000"
    assert isinstance(first["rhs"], str)
    assert isinstance(first["gap"], str)


@pytest.mark.asyncio
async def test_evaluate_run_preserves_severity_bloquant_and_null(
    captured: dict[str, Any],
) -> None:
    transport = _transport(captured, lambda _r: httpx.Response(200, json=_VALID_C14_BODY))
    client = _make_client(transport)

    result = await client.evaluate_run(
        run_id=_RUN_ID, tenant_id=_TENANT_ID, arrete_date="2026-02-28"
    )

    assert result["verdicts"][0]["severity"] == "BLOQUANT"
    assert result["verdicts"][1]["severity"] is None


@pytest.mark.asyncio
async def test_evaluate_run_targets_canonical_endpoint(captured: dict[str, Any]) -> None:
    transport = _transport(captured, lambda _r: httpx.Response(200, json=_VALID_C14_BODY))
    client = _make_client(transport)

    await client.evaluate_run(run_id=_RUN_ID, tenant_id=_TENANT_ID, arrete_date="2026-02-28")

    assert captured["method"] == "POST"
    assert captured["url"].endswith(f"/api/engine/runs/{_RUN_ID}/evaluate")


@pytest.mark.asyncio
async def test_evaluate_run_body_carries_arrete_date_only(captured: dict[str, Any]) -> None:
    """C14 reads XMLs from xml_uploads via DB JOIN; the caller MUST NOT
    send any xml_files / xml_strings / file payload in the body.
    """
    transport = _transport(captured, lambda _r: httpx.Response(200, json=_VALID_C14_BODY))
    client = _make_client(transport)

    await client.evaluate_run(run_id=_RUN_ID, tenant_id=_TENANT_ID, arrete_date="2026-02-28")

    assert captured["body"] == {"arrete_date": "2026-02-28"}
    assert "xml_files" not in captured["body"]


@pytest.mark.asyncio
async def test_evaluate_run_signs_authorization_header(captured: dict[str, Any]) -> None:
    transport = _transport(captured, lambda _r: httpx.Response(200, json=_VALID_C14_BODY))
    client = _make_client(transport)

    await client.evaluate_run(run_id=_RUN_ID, tenant_id=_TENANT_ID, arrete_date="2026-02-28")

    auth = captured["headers"]["authorization"]
    assert auth.startswith("Bearer ")
    assert captured["headers"]["content-type"] == "application/json"


# ---------------------------------------------------------------------------
# C15-B — error paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_run_raises_evaluation_error_on_401(
    captured: dict[str, Any],
) -> None:
    transport = _transport(
        captured,
        lambda _r: httpx.Response(
            401, json={"error": {"code": "MISSING_BEARER", "message": "no token"}}
        ),
    )
    client = _make_client(transport)

    with pytest.raises(EvaluationError) as excinfo:
        await client.evaluate_run(run_id=_RUN_ID, tenant_id=_TENANT_ID, arrete_date="2026-02-28")
    assert excinfo.value.status_code == 401


@pytest.mark.asyncio
async def test_evaluate_run_raises_evaluation_error_on_500_with_message(
    captured: dict[str, Any],
) -> None:
    transport = _transport(
        captured,
        lambda _r: httpx.Response(
            500,
            json={
                "error": {
                    "code": "EVALUATION_ENGINE_ERROR",
                    "message": "evaluator engine raised — see server logs for details",
                }
            },
        ),
    )
    client = _make_client(transport)

    with pytest.raises(EvaluationError) as excinfo:
        await client.evaluate_run(run_id=_RUN_ID, tenant_id=_TENANT_ID, arrete_date="2026-02-28")
    assert excinfo.value.status_code == 500
    assert "evaluator engine raised" in str(excinfo.value)


@pytest.mark.asyncio
async def test_evaluate_run_raises_timeout_error_on_httpx_timeout(
    captured: dict[str, Any],
) -> None:
    def _raise_timeout(_request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("simulated server hang")

    transport = _transport(captured, _raise_timeout)
    client = _make_client(transport)

    with pytest.raises(EvaluationTimeoutError) as excinfo:
        await client.evaluate_run(
            run_id=_RUN_ID,
            tenant_id=_TENANT_ID,
            arrete_date="2026-02-28",
            timeout_seconds=2.5,
        )
    assert excinfo.value.run_id == _RUN_ID
    assert excinfo.value.timeout_seconds == 2.5


def test_evaluation_timeout_error_is_subclass_of_evaluation_error() -> None:
    """A single `except EvaluationError` block must swallow both the
    HTTP error path and the timeout path.
    """
    err = EvaluationTimeoutError(run_id=_RUN_ID, timeout_seconds=10.0)
    assert isinstance(err, EvaluationError)


# ---------------------------------------------------------------------------
# C15-C — _engine_auth_headers refactor sanity
# ---------------------------------------------------------------------------


def test_engine_auth_headers_returns_authorization_and_content_type() -> None:
    """The extracted helper must return the canonical 2-key headers
    dict so both _post() and evaluate_run() see the same auth layer.
    """
    client = RegflowApiClient(
        http_client=httpx.AsyncClient(base_url=f"{settings.api_url.rstrip('/')}/api/engine"),
    )
    headers = client._engine_auth_headers(_TENANT_ID)
    assert "Authorization" in headers
    assert headers["Authorization"].startswith("Bearer ")
    assert headers["Content-Type"] == "application/json"
