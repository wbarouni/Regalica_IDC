"""C17b contract tests — _call_t1_runner specialist.

Coverage:
  - Defensive paths (2): no current_run_id, no api_client → AgentResult
    success=False with the canonical 7-key output dict (zero totals,
    rejection_step=None, rejection_reason carrying the operator-facing
    message).
  - Happy path (1): _run_t1_validation returns an EvaluateRunResult →
    AgentResult success=True with the 7-key output mapping the totals.
  - T1RejectionError path (1): _run_t1_validation raises →
    AgentResult success=False with rejection_step / rejection_reason
    populated from the exception.
  - Dispatch table (1): "t1_runner" entry registered in
    _SPECIALIST_INVOKERS so DB-driven dispatch can resolve it.

No DB / no network — every external is monkey-patched.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.exceptions import T1RejectionError
from app.services.orchestrator import (
    _SPECIALIST_INVOKERS,
    _call_t1_runner,
    _SpecialistContext,
)

_TENANT_ID = "bbbbbbbb-0000-7000-8000-000000000001"
_RUN_ID = "aaaaaaaa-0000-7000-8000-000000000001"


def _meta() -> dict[str, Any]:
    """Stub PromptMeta — _call_t1_runner ignores it (deletes meta first)."""
    return {
        "template": "irrelevant",
        "temperature": 0.3,
        "max_tokens": 512,
        "thinking_enabled": False,
        "target_model": "gemini-2.5-flash",
        "output_contract": "string",
        "static_response": None,
        "model_tier": "standard",
    }


def _ctx(
    *,
    current_run_id: str | None = _RUN_ID,
    api_client: Any = None,
) -> _SpecialistContext:
    return _SpecialistContext(
        pool=MagicMock(),
        tenant_id=_TENANT_ID,
        llm_client=MagicMock(),
        fail_context=None,
        rule_context=None,
        current_run_id=current_run_id,
        api_client=api_client,
    )


def _evaluate_result_stub() -> dict[str, Any]:
    return {
        "run_id": _RUN_ID,
        "arrete_date": "2026-02-28",
        "evaluated_at": "2026-05-03T10:00:00Z",
        "duration_ms": 1250,
        "verdicts": [],
        "totals": {
            "pass_": 935,
            "fail_severe": 2,
            "fail_rounding": 1,
            "skipped_missing_annexe": 0,
            "skipped_missing_rubrique": 0,
            "skipped_missing_colonne": 0,
            "skipped_missing_data": 0,
            "skipped_conditional": 0,
            "skipped_unsupported_op": 0,
            "skipped_literal_text": 0,
            "rules_applicable_total": 938,
        },
    }


# ---------------------------------------------------------------------------
# Defensive paths
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_t1_runner_returns_no_active_run_when_run_id_missing() -> None:
    result = await _call_t1_runner(_meta(), _ctx(current_run_id=None))

    assert result.success is False
    assert result.error == "no_active_run"
    assert result.output["success"] is False
    assert result.output["rejection_step"] is None
    assert "Aucun run actif" in result.output["rejection_reason"]
    assert result.output["total_fail_severe"] == 0


@pytest.mark.asyncio
async def test_t1_runner_returns_no_api_client_when_client_missing() -> None:
    result = await _call_t1_runner(_meta(), _ctx(api_client=None))

    assert result.success is False
    assert result.error == "no_api_client"
    assert result.output["success"] is False
    assert "client moteur" in result.output["rejection_reason"]


# ---------------------------------------------------------------------------
# Happy path — _run_t1_validation succeeds
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_t1_runner_maps_evaluate_result_to_seven_key_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()  # not called directly here

    expected = _evaluate_result_stub()
    mock_runner = AsyncMock(return_value=expected)
    monkeypatch.setattr("app.services.orchestrator._run_t1_validation", mock_runner)

    result = await _call_t1_runner(_meta(), _ctx(api_client=api_client))

    assert result.success is True
    assert result.error is None
    assert result.output == {
        "success": True,
        "total_fail_severe": 2,
        "total_fail_rounding": 1,
        "total_pass": 935,
        "duration_ms": 1250,
        "rejection_step": None,
        "rejection_reason": None,
    }
    mock_runner.assert_awaited_once()


# ---------------------------------------------------------------------------
# Rejection path — T1RejectionError
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_t1_runner_translates_t1_rejection_into_seven_key_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    api_client = MagicMock()

    mock_runner = AsyncMock(
        side_effect=T1RejectionError(step=1, reason="La structure XSD a échoué."),
    )
    monkeypatch.setattr("app.services.orchestrator._run_t1_validation", mock_runner)

    result = await _call_t1_runner(_meta(), _ctx(api_client=api_client))

    assert result.success is False
    assert result.error == "t1_rejected_step_1"
    assert result.output["success"] is False
    assert result.output["rejection_step"] == 1
    assert result.output["rejection_reason"] == "La structure XSD a échoué."
    assert result.output["total_fail_severe"] == 0


# ---------------------------------------------------------------------------
# Dispatch table
# ---------------------------------------------------------------------------


def test_t1_runner_registered_in_specialist_invokers() -> None:
    assert "t1_runner" in _SPECIALIST_INVOKERS
