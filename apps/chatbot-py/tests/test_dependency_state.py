"""P6 — chat-driven inter-annex awareness.

Unit tests for `_load_run_dependency_state`, the orchestrator helper
that mirrors the upload-time `DependencyAgent` but reads its inputs
from `validation_runs` + `validation_run_uploads`. The function is
called for per-FAIL intents (zoom / cluster / historical / plan) on
every chat turn so the aggregator can surface the inter-annex
context when companions are missing.

Mocking strategy: the pool dispatches `fetchrow` / `fetch` by query
substring (4 distinct SQL fragments). All tests run pure in-process
— no DB, no asyncpg.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.services.orchestrator import _load_run_dependency_state

_TENANT = "00000000-0000-0000-0000-000000000001"
_RUN_ID = "00000000-0000-0000-0000-000000000aaa"


def _build_pool(
    *,
    run_row: dict[str, Any] | None,
    required_companions: list[str] | None = None,
    submitted_companions: list[str] | None = None,
    parasitic_count: int = 0,
    inter_annex_rule_count: int = 1,
    fail_on: str | None = None,
) -> MagicMock:
    """Pool dispatcher keyed on query substring.

    `run_row` mirrors the validation_runs SELECT.
    `required_companions` mirrors referentials_annexe_dependencies.
    `submitted_companions` mirrors validation_run_uploads JOIN xml_uploads.
    `parasitic_count` mirrors the FINAL rules_active COUNT(*) (the
    parasitic-fail count for the missing companions; matches the
    `involved_annexes` query).
    `inter_annex_rule_count` mirrors the RDG-side gate query
    (`ax_term = primary AND is_inter_annexe = TRUE`). Defaults to 1
    so existing tests that don't set it explicitly still pass through
    the gate. Set to 0 to exercise the early-return when the primary
    annex carries no inter-annex rule in its RDG corpus.
    `fail_on` ∈ {"validation_runs", "dependencies", "uploads",
    "rules_active_gate", "rules_active_parasitic"} short-circuits the
    matching dispatch with a RuntimeError so we can exercise the
    defensive return-None branches. The two rules_active variants
    correspond to the gate query (ax_term = primary) and the
    parasitic-count query (involved_annexes && missing) — they fail
    independently in production so the tests must too.
    """
    required = required_companions or []
    submitted = submitted_companions or []

    async def fake_fetchrow(query: str, *_args: Any) -> dict[str, Any] | None:
        if "FROM validation_runs" in query:
            if fail_on == "validation_runs":
                raise RuntimeError("simulated db down on validation_runs")
            return run_row
        if "FROM rules_active" in query:
            # Two distinct rules_active queries:
            #   1. RDG-side gate (ax_term = primary)
            #   2. Parasitic count (involved_annexes && missing)
            # Differentiate by substring presence of "involved_annexes".
            if "involved_annexes" in query:
                if fail_on in {"rules_active", "rules_active_parasitic"}:
                    raise RuntimeError("simulated db down on rules_active parasitic")
                return {"cnt": parasitic_count}
            if fail_on in {"rules_active", "rules_active_gate"}:
                raise RuntimeError("simulated db down on rules_active gate")
            return {"cnt": inter_annex_rule_count}
        return None

    async def fake_fetch(query: str, *_args: Any) -> list[dict[str, Any]]:
        if "FROM referentials_annexe_dependencies" in query:
            if fail_on == "dependencies":
                raise RuntimeError("simulated db down on dependencies")
            return [{"target_annexe_code": c} for c in required]
        if "FROM validation_run_uploads" in query:
            if fail_on == "uploads":
                raise RuntimeError("simulated db down on uploads")
            return [{"code_annexe": c} for c in submitted]
        return []

    pool = MagicMock()
    pool.fetchrow = AsyncMock(side_effect=fake_fetchrow)
    pool.fetch = AsyncMock(side_effect=fake_fetch)
    return pool


@pytest.mark.asyncio
async def test_dependency_state_returns_none_when_run_absent() -> None:
    pool = _build_pool(run_row=None)
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is None


@pytest.mark.asyncio
async def test_dependency_state_returns_none_when_primary_annexe_missing() -> None:
    """Defensive: a malformed run row without primary_annexe_code is treated
    as absent so the chat path skips the inter-annex block entirely."""
    pool = _build_pool(run_row={"primary_annexe_code": None, "arrete_date": "2026-02-28"})
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is None


@pytest.mark.asyncio
async def test_dependency_state_returns_none_for_autonomous_primary_annexe() -> None:
    """When the primary annexe declares no companion in the dependencies
    referential, the chat path skips BLOC 7 entirely — there is no
    inter-annex context to surface."""
    pool = _build_pool(
        run_row={"primary_annexe_code": "624", "arrete_date": "2026-02-28"},
        required_companions=[],  # autonomous in dependencies referential
        inter_annex_rule_count=1,  # must pass the RDG gate first
    )
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is None


@pytest.mark.asyncio
async def test_dependency_state_returns_none_when_primary_has_no_inter_annexe_rule() -> None:
    """RDG-side gate (Bug 7, doctrine docs/04 §6 + 2026-05-08 user
    diagnostic): even when the dependencies referential declares
    companions for the primary annex, we DO NOT request a companion
    XML if the primary's RDG corpus has zero rules with
    is_inter_annexe = TRUE. The companion would have nothing to feed
    into and the prompt would be noise."""
    pool = _build_pool(
        run_row={"primary_annexe_code": "640", "arrete_date": "2026-02-28"},
        required_companions=["641"],  # dependencies referential says yes
        submitted_companions=["640"],
        inter_annex_rule_count=0,  # but RDG corpus says no inter-annex rules
        parasitic_count=12,  # would surface 12 if the gate didn't fire
    )
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is None, "RDG gate must short-circuit when ax_term=640 has no is_inter_annexe rule"


@pytest.mark.asyncio
async def test_dependency_state_surfaces_missing_companions_with_parasitic_count() -> None:
    pool = _build_pool(
        run_row={"primary_annexe_code": "630", "arrete_date": "2026-02-28"},
        required_companions=["631", "604"],
        submitted_companions=["630"],  # only the primary was uploaded
        parasitic_count=12,
    )
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is not None
    assert out["primary_annexe"] == "630"
    assert out["arrete_date"] == "2026-02-28"
    assert out["required_companions"] == ["604", "631"]
    assert out["submitted_companions"] == ["630"]
    assert out["missing_companions"] == ["604", "631"]
    assert out["parasitic_fail_count"] == 12


@pytest.mark.asyncio
async def test_dependency_state_no_missing_when_all_companions_submitted() -> None:
    """When the user uploaded all declared companions, missing_companions
    is empty and the orchestrator must NOT inject the synthetic
    specialist outcome (the call site gates on a non-empty missing list).
    The function still returns the full state for callers that want to
    audit the autonomous case."""
    pool = _build_pool(
        run_row={"primary_annexe_code": "630", "arrete_date": "2026-02-28"},
        required_companions=["631", "604"],
        submitted_companions=["630", "631", "604"],
        parasitic_count=0,
    )
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is not None
    assert out["missing_companions"] == []
    assert out["parasitic_fail_count"] == 0


@pytest.mark.asyncio
async def test_dependency_state_returns_none_on_validation_runs_db_error() -> None:
    pool = _build_pool(run_row=None, fail_on="validation_runs")
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is None


@pytest.mark.asyncio
async def test_dependency_state_returns_none_on_dependencies_db_error() -> None:
    pool = _build_pool(
        run_row={"primary_annexe_code": "630", "arrete_date": "2026-02-28"},
        fail_on="dependencies",
    )
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is None


@pytest.mark.asyncio
async def test_dependency_state_returns_none_on_uploads_db_error() -> None:
    pool = _build_pool(
        run_row={"primary_annexe_code": "630", "arrete_date": "2026-02-28"},
        required_companions=["631"],
        fail_on="uploads",
    )
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is None


@pytest.mark.asyncio
async def test_dependency_state_collapses_parasitic_to_zero_on_rules_active_db_error() -> None:
    """A failure on the parasitic-count COUNT(*) must NOT mask the rest
    of the dependency state — we surface 0 so the chat output omits the
    count rather than failing the whole turn. Targets the parasitic
    query specifically (the gate query upstream still succeeds)."""
    pool = _build_pool(
        run_row={"primary_annexe_code": "630", "arrete_date": "2026-02-28"},
        required_companions=["631"],
        submitted_companions=["630"],
        fail_on="rules_active_parasitic",
    )
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is not None
    assert out["missing_companions"] == ["631"]
    assert out["parasitic_fail_count"] == 0


@pytest.mark.asyncio
async def test_dependency_state_returns_none_on_rules_active_gate_db_error() -> None:
    """When the RDG-side gate query itself fails, we collapse the
    inter-annex rule count to 0 and short-circuit to None. The chat
    path then skips the dependency block — defensive against a
    misconfigured tenant or a transient rules_active outage."""
    pool = _build_pool(
        run_row={"primary_annexe_code": "630", "arrete_date": "2026-02-28"},
        required_companions=["631"],
        submitted_companions=["630"],
        fail_on="rules_active_gate",
    )
    out = await _load_run_dependency_state(pool, run_id=_RUN_ID, tenant_id=_TENANT)
    assert out is None
