"""Contract tests for orchestrator._call_t1_runner finalize wiring (Tranche 0 D4).

Validates that:
  * Successful T1 → finalize_run called with status='completed' and
    correctly mapped totals.
  * T1RejectionError → finalize_run called with status='failed' and
    error_code resolved via ErrorResolver.from_t1_exception().
  * EvaluationError / EvaluationTimeoutError → finalize_run called
    with status='failed', user-facing AgentResult error message.
  * No api_client → t1_runner short-circuits, finalize NOT called.
  * No current_run_id → t1_runner short-circuits, finalize NOT called.
  * No error_resolver → finalize_failure_best_effort skips silently.
  * Empty rule corpus (rules_applicable_total=0) → finalize as failed
    with t1_no_verdicts.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.domain.error_resolver import (
    T0_EMBEDDED_FAIL,
    T0_XSD_INVALID,
    T1_ENGINE_EXCEPTION,
    T1_NO_VERDICTS,
    T1_TIMEOUT,
    ErrorResolver,
    all_canonical_codes,
)
from app.exceptions import (
    EvaluationError,
    EvaluationTimeoutError,
    T1RejectionError,
)
from app.services.orchestrator import (
    _call_t1_runner,
    _SpecialistContext,
)


def _evaluate_result_stub(
    *,
    pass_count: int = 100,
    fail_severe: int = 0,
    fail_rounding: int = 0,
    rules_total: int = 100,
) -> dict[str, Any]:
    return {
        "run_id": "aaaaaaaa-1111-7111-8111-111111111111",
        "arrete_date": "2026-02-28",
        "evaluated_at": "2026-05-04T10:00:00Z",
        "duration_ms": 1234,
        "verdicts": [],
        "totals": {
            "pass_": pass_count,
            "fail_severe": fail_severe,
            "fail_rounding": fail_rounding,
            "skipped_missing_annexe": 0,
            "skipped_missing_rubrique": 0,
            "skipped_missing_colonne": 0,
            "skipped_missing_data": 0,
            "skipped_conditional": 0,
            "skipped_unsupported_op": 0,
            "skipped_literal_text": 0,
            "rules_applicable_total": rules_total,
        },
    }


def _build_ctx(
    *,
    api_client: Any = None,
    current_run_id: str | None = "aaaaaaaa-1111-7111-8111-111111111111",
    error_resolver: ErrorResolver | None = None,
    correlation_id: str | None = "cccccccc-1111-4111-8111-111111111111",
) -> _SpecialistContext:
    return _SpecialistContext(
        pool=MagicMock(),
        tenant_id="bbbbbbbb-1111-7111-8111-111111111111",
        llm_client=MagicMock(),
        fail_context=None,
        rule_context=None,
        current_run_id=current_run_id,
        api_client=api_client,
        error_resolver=error_resolver,
        correlation_id=correlation_id,
    )


@pytest.fixture
def resolver() -> ErrorResolver:
    return ErrorResolver.from_codes(all_canonical_codes())


@pytest.mark.asyncio
async def test_t1_success_calls_finalize_with_completed_status(
    monkeypatch: pytest.MonkeyPatch,
    resolver: ErrorResolver,
) -> None:
    expected = _evaluate_result_stub(pass_count=937, fail_severe=2, rules_total=939)
    mock_runner = AsyncMock(return_value=expected)
    monkeypatch.setattr("app.services.orchestrator._run_t1_validation", mock_runner)

    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(return_value=expected)
    api_client.finalize_run = AsyncMock(return_value={"data": {"idempotent": False}})
    ctx = _build_ctx(api_client=api_client, error_resolver=resolver)

    result = await _call_t1_runner(MagicMock(), ctx)

    assert result.success is True
    api_client.finalize_run.assert_awaited_once()
    call_kwargs = api_client.finalize_run.await_args.kwargs
    payload = call_kwargs["payload"]
    assert payload["status"] == "completed"
    assert payload["totals"]["pass"] == 937
    assert payload["totals"]["fail_severe"] == 2
    assert payload["error_code"] is None
    assert call_kwargs["correlation_id"] == "cccccccc-1111-4111-8111-111111111111"


@pytest.mark.asyncio
async def test_t1_no_verdicts_finalizes_as_failed_with_t1_no_verdicts(
    monkeypatch: pytest.MonkeyPatch,
    resolver: ErrorResolver,
) -> None:
    # rules_applicable_total = 0 ⇒ engine produced no verdicts ⇒
    # finalize as failed (not completed) with t1_no_verdicts code.
    expected = _evaluate_result_stub(pass_count=0, rules_total=0)
    monkeypatch.setattr(
        "app.services.orchestrator._run_t1_validation",
        AsyncMock(return_value=expected),
    )

    api_client = MagicMock()
    api_client.finalize_run = AsyncMock(return_value={"data": {}})
    ctx = _build_ctx(api_client=api_client, error_resolver=resolver)

    result = await _call_t1_runner(MagicMock(), ctx)

    # The agent itself returns success=True (the engine returned cleanly).
    # The /finalize call is what flips the run state to failed.
    assert result.success is True
    api_client.finalize_run.assert_awaited_once()
    payload = api_client.finalize_run.await_args.kwargs["payload"]
    assert payload["status"] == "failed"
    assert payload["error_code"] == T1_NO_VERDICTS


@pytest.mark.asyncio
async def test_t1_rejection_step_1_finalizes_with_t0_xsd_invalid(
    monkeypatch: pytest.MonkeyPatch,
    resolver: ErrorResolver,
) -> None:
    monkeypatch.setattr(
        "app.services.orchestrator._run_t1_validation",
        AsyncMock(side_effect=T1RejectionError(step=1, reason="XSD KO")),
    )

    api_client = MagicMock()
    api_client.finalize_run = AsyncMock(return_value={"data": {}})
    ctx = _build_ctx(api_client=api_client, error_resolver=resolver)

    result = await _call_t1_runner(MagicMock(), ctx)

    assert result.success is False
    assert result.output["rejection_step"] == 1
    api_client.finalize_run.assert_awaited_once()
    payload = api_client.finalize_run.await_args.kwargs["payload"]
    assert payload["status"] == "failed"
    assert payload["error_code"] == T0_XSD_INVALID


@pytest.mark.asyncio
async def test_t1_rejection_step_2_finalizes_with_t0_embedded_fail(
    monkeypatch: pytest.MonkeyPatch,
    resolver: ErrorResolver,
) -> None:
    monkeypatch.setattr(
        "app.services.orchestrator._run_t1_validation",
        AsyncMock(side_effect=T1RejectionError(step=2, reason="embedded KO")),
    )
    api_client = MagicMock()
    api_client.finalize_run = AsyncMock(return_value={"data": {}})
    ctx = _build_ctx(api_client=api_client, error_resolver=resolver)

    await _call_t1_runner(MagicMock(), ctx)

    payload = api_client.finalize_run.await_args.kwargs["payload"]
    assert payload["error_code"] == T0_EMBEDDED_FAIL


@pytest.mark.asyncio
async def test_evaluation_timeout_finalizes_with_t1_timeout(
    monkeypatch: pytest.MonkeyPatch,
    resolver: ErrorResolver,
) -> None:
    monkeypatch.setattr(
        "app.services.orchestrator._run_t1_validation",
        AsyncMock(
            side_effect=EvaluationTimeoutError(
                run_id="aaaaaaaa-1111-7111-8111-111111111111",
                timeout_seconds=30.0,
            ),
        ),
    )
    api_client = MagicMock()
    api_client.finalize_run = AsyncMock(return_value={"data": {}})
    ctx = _build_ctx(api_client=api_client, error_resolver=resolver)

    result = await _call_t1_runner(MagicMock(), ctx)

    assert result.success is False
    assert result.error == "t1_engine_failure"
    payload = api_client.finalize_run.await_args.kwargs["payload"]
    assert payload["error_code"] == T1_TIMEOUT


@pytest.mark.asyncio
async def test_evaluation_error_500_finalizes_with_t1_engine_exception(
    monkeypatch: pytest.MonkeyPatch,
    resolver: ErrorResolver,
) -> None:
    monkeypatch.setattr(
        "app.services.orchestrator._run_t1_validation",
        AsyncMock(side_effect=EvaluationError("upstream 500", status_code=500)),
    )
    api_client = MagicMock()
    api_client.finalize_run = AsyncMock(return_value={"data": {}})
    ctx = _build_ctx(api_client=api_client, error_resolver=resolver)

    await _call_t1_runner(MagicMock(), ctx)

    payload = api_client.finalize_run.await_args.kwargs["payload"]
    assert payload["error_code"] == T1_ENGINE_EXCEPTION


@pytest.mark.asyncio
async def test_no_api_client_short_circuits_without_finalize(
    monkeypatch: pytest.MonkeyPatch,
    resolver: ErrorResolver,
) -> None:
    # Defensive path — predates Tranche 0 (existing C17b test). The
    # finalize call cannot happen without an api_client.
    ctx = _build_ctx(api_client=None, error_resolver=resolver)
    result = await _call_t1_runner(MagicMock(), ctx)
    assert result.success is False
    assert result.error == "no_api_client"


@pytest.mark.asyncio
async def test_no_run_id_short_circuits_without_finalize(
    resolver: ErrorResolver,
) -> None:
    api_client = MagicMock()
    api_client.finalize_run = AsyncMock()
    ctx = _build_ctx(api_client=api_client, current_run_id=None, error_resolver=resolver)

    result = await _call_t1_runner(MagicMock(), ctx)

    assert result.success is False
    assert result.error == "no_active_run"
    api_client.finalize_run.assert_not_called()


@pytest.mark.asyncio
async def test_no_error_resolver_skips_failure_finalize(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # When error_resolver is None (DB pool absent at startup), the
    # failure finalize is skipped silently — log only, never raises.
    monkeypatch.setattr(
        "app.services.orchestrator._run_t1_validation",
        AsyncMock(side_effect=T1RejectionError(step=1, reason="X")),
    )
    api_client = MagicMock()
    api_client.finalize_run = AsyncMock()
    ctx = _build_ctx(api_client=api_client, error_resolver=None)

    result = await _call_t1_runner(MagicMock(), ctx)
    assert result.success is False
    api_client.finalize_run.assert_not_called()


@pytest.mark.asyncio
async def test_finalize_post_failure_does_not_raise(
    monkeypatch: pytest.MonkeyPatch,
    resolver: ErrorResolver,
) -> None:
    """A network failure on /finalize POST must NOT crash the chat path."""
    expected = _evaluate_result_stub()
    monkeypatch.setattr(
        "app.services.orchestrator._run_t1_validation",
        AsyncMock(return_value=expected),
    )
    api_client = MagicMock()
    api_client.finalize_run = AsyncMock(side_effect=RuntimeError("network down"))
    ctx = _build_ctx(api_client=api_client, error_resolver=resolver)

    result = await _call_t1_runner(MagicMock(), ctx)

    # T1 succeeded → AgentResult is success, even if the side-effect
    # finalize POST raised. The chat path remains responsive.
    assert result.success is True
