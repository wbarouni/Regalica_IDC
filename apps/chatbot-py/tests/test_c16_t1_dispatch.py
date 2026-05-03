"""C16 contract tests — T1 dispatch loop in orchestrator.py.

Coverage of the four pure helpers shipped in C16:
  - T1RejectionError      : carries (step, reason), surfaces in str().
  - _get_run_arrete_date  : reads validation_runs.arrete_date as ISO str.
  - _check_t0_agents_status : maps run_agent_steps JOIN workflow_steps T0
                               rows to the (ingestor, dependency, temporal)
                               booleans the dispatcher needs.
  - _run_t1_validation    : 3-step BCT pipeline; rejects via
                             T1RejectionError on any step that does not
                             clear; returns EvaluateRunResult on success.

Tests use AsyncMock for pool / api_client — no DB, no network.
The pool's `fetch` method receives two SELECTs in
_check_t0_agents_status only one (the JOIN); _get_run_arrete_date uses
`fetchrow`. So the test wires AsyncMock on each method individually
(no side_effect chain needed).
"""

from __future__ import annotations

from datetime import date
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.exceptions import (
    EvaluationError,
    EvaluationTimeoutError,
    T1RejectionError,
)
from app.services.orchestrator import (
    _check_t0_agents_status,
    _get_run_arrete_date,
    _run_t1_validation,
)

_TENANT_ID = "bbbbbbbb-0000-7000-8000-000000000001"
_RUN_ID = "aaaaaaaa-0000-7000-8000-000000000001"


def _row(agent_type: str, function_name: str, status: str) -> dict[str, str]:
    return {
        "agent_type": agent_type,
        "function_name": function_name,
        "status": status,
    }


def _all_done_rows() -> list[dict[str, str]]:
    return [
        _row("ingestor_xml", "parse_xml", "done"),
        _row("dependency", "check_companions", "done"),
        _row("temporal", "check_dates", "done"),
    ]


def _evaluate_result_stub() -> dict[str, Any]:
    """Minimal EvaluateRunResult-shaped dict the api_client mock returns."""
    return {
        "run_id": _RUN_ID,
        "arrete_date": "2026-02-28",
        "evaluated_at": "2026-05-03T10:00:00.000Z",
        "duration_ms": 1000,
        "verdicts": [],
        "totals": {
            "pass_": 1,
            "fail_severe": 0,
            "fail_rounding": 0,
            "skipped_missing_annexe": 0,
            "skipped_missing_rubrique": 0,
            "skipped_missing_colonne": 0,
            "skipped_missing_data": 0,
            "skipped_conditional": 0,
            "skipped_unsupported_op": 0,
            "skipped_literal_text": 0,
            "rules_applicable_total": 1,
        },
    }


# ---------------------------------------------------------------------------
# T1RejectionError
# ---------------------------------------------------------------------------


def test_t1_rejection_error_carries_step_and_reason() -> None:
    err = T1RejectionError(step=1, reason="test motif")
    assert err.step == 1
    assert err.reason == "test motif"


def test_t1_rejection_error_str_mentions_step() -> None:
    err = T1RejectionError(step=3, reason="quelque chose")
    assert "étape 3" in str(err)


# ---------------------------------------------------------------------------
# _get_run_arrete_date
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_run_arrete_date_returns_iso_string_from_date() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value={"arrete_date": date(2026, 2, 28)})

    result = await _get_run_arrete_date(pool, _RUN_ID, _TENANT_ID)

    assert result == "2026-02-28"


@pytest.mark.asyncio
async def test_get_run_arrete_date_returns_none_when_run_missing() -> None:
    pool = MagicMock()
    pool.fetchrow = AsyncMock(return_value=None)

    result = await _get_run_arrete_date(pool, _RUN_ID, _TENANT_ID)

    assert result is None


# ---------------------------------------------------------------------------
# _check_t0_agents_status
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_t0_agents_all_done() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=_all_done_rows())

    ingestor, dependency, temporal = await _check_t0_agents_status(pool, _RUN_ID, _TENANT_ID)

    assert (ingestor, dependency, temporal) == (True, True, True)


@pytest.mark.asyncio
async def test_check_t0_agents_ingestor_error_returns_false_for_ingestor() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(
        return_value=[
            _row("ingestor_xml", "parse_xml", "error"),
            _row("dependency", "check_companions", "done"),
            _row("temporal", "check_dates", "done"),
        ],
    )

    ingestor, dependency, temporal = await _check_t0_agents_status(pool, _RUN_ID, _TENANT_ID)

    assert ingestor is False
    assert dependency is True
    assert temporal is True


@pytest.mark.asyncio
async def test_check_t0_agents_dependency_absent_returns_false() -> None:
    """A row absent from run_agent_steps must map to False (not raise)."""
    pool = MagicMock()
    pool.fetch = AsyncMock(
        return_value=[
            _row("ingestor_xml", "parse_xml", "done"),
            _row("temporal", "check_dates", "done"),
        ],
    )

    ingestor, dependency, temporal = await _check_t0_agents_status(pool, _RUN_ID, _TENANT_ID)

    assert ingestor is True
    assert dependency is False
    assert temporal is True


@pytest.mark.asyncio
async def test_check_t0_agents_zero_rows_returns_all_false() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=[])

    ingestor, dependency, temporal = await _check_t0_agents_status(pool, _RUN_ID, _TENANT_ID)

    assert (ingestor, dependency, temporal) == (False, False, False)


# ---------------------------------------------------------------------------
# _run_t1_validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_t1_validation_rejects_step_1_when_ingestor_not_done() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(
        return_value=[
            _row("ingestor_xml", "parse_xml", "error"),
            _row("dependency", "check_companions", "done"),
            _row("temporal", "check_dates", "done"),
        ],
    )
    pool.fetchrow = AsyncMock(return_value=None)
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()

    with pytest.raises(T1RejectionError) as excinfo:
        await _run_t1_validation(pool, _RUN_ID, _TENANT_ID, api_client)

    assert excinfo.value.step == 1
    assert "XSD" in excinfo.value.reason
    api_client.evaluate_run.assert_not_called()


@pytest.mark.asyncio
async def test_run_t1_validation_rejects_step_2_when_dependency_not_done() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(
        return_value=[
            _row("ingestor_xml", "parse_xml", "done"),
            _row("temporal", "check_dates", "done"),
        ],
    )
    pool.fetchrow = AsyncMock(return_value=None)
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()

    with pytest.raises(T1RejectionError) as excinfo:
        await _run_t1_validation(pool, _RUN_ID, _TENANT_ID, api_client)

    assert excinfo.value.step == 2
    assert "annexes compagnes" in excinfo.value.reason


@pytest.mark.asyncio
async def test_run_t1_validation_rejects_step_2_when_temporal_not_done() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(
        return_value=[
            _row("ingestor_xml", "parse_xml", "done"),
            _row("dependency", "check_companions", "done"),
        ],
    )
    pool.fetchrow = AsyncMock(return_value=None)
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()

    with pytest.raises(T1RejectionError) as excinfo:
        await _run_t1_validation(pool, _RUN_ID, _TENANT_ID, api_client)

    assert excinfo.value.step == 2
    assert "cohérence temporelle" in excinfo.value.reason


@pytest.mark.asyncio
async def test_run_t1_validation_rejects_step_3_when_arrete_date_missing() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=_all_done_rows())
    pool.fetchrow = AsyncMock(return_value=None)
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()

    with pytest.raises(T1RejectionError) as excinfo:
        await _run_t1_validation(pool, _RUN_ID, _TENANT_ID, api_client)

    assert excinfo.value.step == 3
    assert "arrêté" in excinfo.value.reason
    api_client.evaluate_run.assert_not_called()


@pytest.mark.asyncio
async def test_run_t1_validation_returns_evaluate_result_on_full_success() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=_all_done_rows())
    pool.fetchrow = AsyncMock(return_value={"arrete_date": date(2026, 2, 28)})

    expected = _evaluate_result_stub()
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(return_value=expected)

    result = await _run_t1_validation(pool, _RUN_ID, _TENANT_ID, api_client)

    assert result == expected
    api_client.evaluate_run.assert_awaited_once_with(
        run_id=_RUN_ID,
        tenant_id=_TENANT_ID,
        arrete_date="2026-02-28",
        timeout_seconds=30.0,
    )


@pytest.mark.asyncio
async def test_run_t1_validation_rejects_step_3_on_evaluate_timeout() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=_all_done_rows())
    pool.fetchrow = AsyncMock(return_value={"arrete_date": date(2026, 2, 28)})

    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(
        side_effect=EvaluationTimeoutError(run_id=_RUN_ID, timeout_seconds=30.0),
    )

    with pytest.raises(T1RejectionError) as excinfo:
        await _run_t1_validation(pool, _RUN_ID, _TENANT_ID, api_client)

    assert excinfo.value.step == 3
    assert "30 secondes" in excinfo.value.reason


@pytest.mark.asyncio
async def test_run_t1_validation_rejects_step_3_on_evaluate_http_error() -> None:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=_all_done_rows())
    pool.fetchrow = AsyncMock(return_value={"arrete_date": date(2026, 2, 28)})

    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(
        side_effect=EvaluationError(message="upstream 500", status_code=500),
    )

    with pytest.raises(T1RejectionError) as excinfo:
        await _run_t1_validation(pool, _RUN_ID, _TENANT_ID, api_client)

    assert excinfo.value.step == 3
    assert "code 500" in excinfo.value.reason
