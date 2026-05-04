"""Tranche 0.7 — contract tests for _invoke_t1_synthesis_aggregator
and _build_synthesis_artifact.

Validates :
  * Happy path : LLM returns markdown → _invoke returns stripped string
  * Empty/whitespace LLM output → returns None
  * LLM exception → returns None + logs warning
  * output_contract='string' triggers _clean_thought_leakage filter
  * _build_synthesis_artifact shape: { markdown, totals: { 4 keys } }
  * conformity_rate computed from pass / (pass + fail_severe + fail_rounding)
  * conformity_rate = None when denominator = 0

No DB, no real LLM. The PromptMeta dict is built inline; the LLMClient
is replaced by an AsyncMock with a deterministic response.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.clients.regflow_api import EvaluateRunResult
from app.services.orchestrator import (
    _build_synthesis_artifact,
    _invoke_t1_synthesis_aggregator,
    _SpecialistContext,
)


def _build_meta() -> dict[str, Any]:
    """Stub PromptMeta — mirrors the shape that load_active_prompt
    returns for regalica/aggregate_t1_result (migration 072-C)."""
    return {
        "template": "Tu es Regalica. Réponds en 2-3 phrases.",
        "temperature": 0.3,
        "max_tokens": 512,
        "thinking_enabled": False,
        "target_model": "gemini-2.5-flash",
        "output_contract": "string",
        "static_response": None,
        "model_tier": "standard",
    }


def _build_ctx(
    llm_response_content: str = "Validation terminée. 935 règles conformes.",
) -> _SpecialistContext:
    llm_client = MagicMock()
    llm_response = MagicMock()
    llm_response.content = llm_response_content
    llm_response.tokens_input = 100
    llm_response.tokens_output = 30
    llm_response.tokens_thinking = 0
    llm_client.complete = AsyncMock(return_value=llm_response)
    return _SpecialistContext(
        pool=MagicMock(),
        tenant_id="bbbbbbbb-1111-7111-8111-111111111111",
        llm_client=llm_client,
        fail_context=None,
        rule_context=None,
        current_run_id="aaaaaaaa-1111-7111-8111-111111111111",
        api_client=MagicMock(),
        error_resolver=None,
        correlation_id="cccccccc-1111-4111-8111-111111111111",
    )


def _build_t1_output(
    *,
    success: bool = True,
    pass_count: int = 935,
    fail_severe: int = 2,
    fail_rounding: int = 1,
) -> dict[str, Any]:
    return {
        "success": success,
        "total_pass": pass_count,
        "total_fail_severe": fail_severe,
        "total_fail_rounding": fail_rounding,
        "duration_ms": 1234,
        "rejection_step": None,
        "rejection_reason": None,
    }


def _build_evaluate_result(
    *,
    pass_count: int = 935,
    fail_severe: int = 2,
    fail_rounding: int = 1,
) -> EvaluateRunResult:
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
            "rules_applicable_total": pass_count + fail_severe + fail_rounding,
        },
    }


# ───────────────────────────────────────────────────────────────────────────
# _invoke_t1_synthesis_aggregator
# ───────────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_happy_path_returns_stripped_markdown() -> None:
    ctx = _build_ctx(llm_response_content="  Validation terminée. 935 règles conformes.  \n\n")
    meta = _build_meta()

    markdown = await _invoke_t1_synthesis_aggregator(meta, ctx, _build_t1_output())

    assert markdown == "Validation terminée. 935 règles conformes."
    ctx.llm_client.complete.assert_awaited_once()


@pytest.mark.asyncio
async def test_passes_canonical_specialist_outputs_payload() -> None:
    """The aggregator MUST receive the same payload shape as the
    downstream orchestrate() step (orch.py:_invoke_aggregator), with
    specialist_outputs[0].output mapping verbatim onto the t1_output."""
    ctx = _build_ctx()
    meta = _build_meta()
    t1_output = _build_t1_output(pass_count=100, fail_severe=5, fail_rounding=3)

    await _invoke_t1_synthesis_aggregator(meta, ctx, t1_output)

    call_args = ctx.llm_client.complete.await_args
    request = call_args.args[0]
    payload = json.loads(request.prompt)
    assert payload["intent_type"] == "launch_validation"
    assert len(payload["specialist_outputs"]) == 1
    so = payload["specialist_outputs"][0]
    assert so["bearer"] == "regalica/aggregate_t1_result"
    assert so["success"] is True
    assert so["output"] == t1_output
    assert so["error"] is None
    # System prompt is the template; LLM-side runtime params come from meta.
    assert request.system_prompt == meta["template"]
    assert request.temperature == meta["temperature"]
    assert request.max_tokens == meta["max_tokens"]
    assert request.thinking_enabled == meta["thinking_enabled"]


@pytest.mark.asyncio
async def test_empty_llm_output_returns_none() -> None:
    ctx = _build_ctx(llm_response_content="   \n\n  ")
    meta = _build_meta()
    markdown = await _invoke_t1_synthesis_aggregator(meta, ctx, _build_t1_output())
    assert markdown is None


@pytest.mark.asyncio
async def test_llm_exception_returns_none() -> None:
    ctx = _build_ctx()
    ctx.llm_client.complete = AsyncMock(side_effect=RuntimeError("Gemini 503"))
    meta = _build_meta()
    markdown = await _invoke_t1_synthesis_aggregator(meta, ctx, _build_t1_output())
    assert markdown is None


@pytest.mark.asyncio
async def test_thought_leakage_cleaned_when_output_contract_is_string() -> None:
    # _clean_thought_leakage drops Gemini thinking-trace pre-announcement
    # LINES (whole-line prefix match against _THOUGHT_LEAKAGE_PREFIXES).
    # Use one of the registered prefixes to verify the filter runs.
    raw = "THOUGHT: I will compose the response now.\nValidation OK. 935 conformes."
    ctx = _build_ctx(llm_response_content=raw)
    meta = _build_meta()  # output_contract='string'
    markdown = await _invoke_t1_synthesis_aggregator(meta, ctx, _build_t1_output())
    assert markdown is not None
    assert "THOUGHT:" not in markdown
    assert "Validation OK" in markdown


@pytest.mark.asyncio
async def test_failed_t1_output_still_invokes_aggregator() -> None:
    # When t1 has rejection_step/rejection_reason set, the aggregator
    # template branches to "rejet sobre en 2 phrases" (per migration
    # 072-C template). The helper still invokes the LLM — None is
    # returned only on LLM exception, not on success=false.
    ctx = _build_ctx(llm_response_content="La validation a été rejetée à l'étape 1.")
    meta = _build_meta()
    failed_output = _build_t1_output(success=False, pass_count=0, fail_severe=0, fail_rounding=0)
    failed_output["rejection_step"] = 1
    failed_output["rejection_reason"] = "XSD KO"

    markdown = await _invoke_t1_synthesis_aggregator(meta, ctx, failed_output)

    assert markdown == "La validation a été rejetée à l'étape 1."
    # Verify success flag in payload mirrors the t1_output.success.
    payload = json.loads(ctx.llm_client.complete.await_args.args[0].prompt)
    assert payload["specialist_outputs"][0]["success"] is False


# ───────────────────────────────────────────────────────────────────────────
# _build_synthesis_artifact
# ───────────────────────────────────────────────────────────────────────────


def test_build_synthesis_artifact_canonical_shape() -> None:
    result = _build_evaluate_result(pass_count=935, fail_severe=2, fail_rounding=1)
    artifact = _build_synthesis_artifact("Validation terminée.", result)
    assert artifact["markdown"] == "Validation terminée."
    assert set(artifact["totals"].keys()) == {
        "pass",
        "fail_severe",
        "fail_rounding",
        "conformity_rate",
    }


def test_build_synthesis_artifact_conformity_rate_4_decimals() -> None:
    # 935 / (935 + 2 + 1) = 935 / 938 = 0.99680170... → 0.9968
    result = _build_evaluate_result(pass_count=935, fail_severe=2, fail_rounding=1)
    artifact = _build_synthesis_artifact("...", result)
    assert artifact["totals"]["conformity_rate"] == 0.9968


def test_build_synthesis_artifact_conformity_rate_none_when_zero_denominator() -> None:
    result = _build_evaluate_result(pass_count=0, fail_severe=0, fail_rounding=0)
    artifact = _build_synthesis_artifact("Aucune règle évaluée.", result)
    assert artifact["totals"]["conformity_rate"] is None


def test_build_synthesis_artifact_conformity_rate_one_when_no_fails() -> None:
    result = _build_evaluate_result(pass_count=100, fail_severe=0, fail_rounding=0)
    artifact = _build_synthesis_artifact("Conforme.", result)
    assert artifact["totals"]["conformity_rate"] == 1.0


def test_build_synthesis_artifact_propagates_totals_verbatim() -> None:
    result = _build_evaluate_result(pass_count=42, fail_severe=7, fail_rounding=3)
    artifact = _build_synthesis_artifact("md", result)
    assert artifact["totals"]["pass"] == 42
    assert artifact["totals"]["fail_severe"] == 7
    assert artifact["totals"]["fail_rounding"] == 3
