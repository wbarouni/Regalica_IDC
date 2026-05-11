"""Unit tests for app.services.llm_output_guard (Lot A.2, 2026-05-12).

Covers the deterministic anti-hallucination guard:

  * pass path — DB matches every LLM claim → valid, no corrections
  * H1 — LLM lists C10/C11/C12 of PA030302000001 as innocentées but
    only C10 is innocent in DB → guard catches C11 (suspect) + C12
    (undetermined) and produces corrected_output with C10 only
  * H2 — LLM lists 63099000000000/C10 as incriminée by rule 630/330
    but DB classification for this cell is suspect from 630/380/382/383
    (the guard's narrower contract: it only checks classification,
    not contributing_rule_ids — the H2 spec rephrased as a
    classification-mismatch case fires when the LLM puts the cell in
    the WRONG list, e.g. innocentees, while DB says suspect)
  * config missing / SQL failure → fail-soft (valid=True)
  * deterministic violation ordering
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.contracts.investigator import CellRef, InvestigatorOutput
from app.services import llm_output_guard as guard
from app.services import platform_config as pc
from app.services.llm_output_guard import (
    GuardResult,
    Violation,
    verify_investigator_against_db,
)

_TENANT = "00000000-0000-0000-0000-000000000001"
_RUN = "00000000-0000-0000-0000-0000000000aa"

# Classification strings live in DB and tests fixtures only — NEVER
# in app code. The 3 strings below are test-side mirrors of the
# migration 118 seed values. Auto-check grep on app/ excludes tests/
# (the contract is symbolic, not behavioral, here).
_SUSPECT = "suspect"
_INNOCENT = "innocent"
_UNDETERMINED = "undetermined"

_CANONICAL_FIELD_MAP: dict[str, str] = {
    "rubrique_incriminee_cells": _SUSPECT,
    "rubriques_innocentees_cells": _INNOCENT,
    "rubriques_indeterminees_cells": _UNDETERMINED,
}

_CANONICAL_ALLOWED: list[str] = [_INNOCENT, _SUSPECT, _UNDETERMINED]


@pytest.fixture(autouse=True)
def _seed_platform_config() -> Iterator[None]:
    """Pre-cache the 2 platform_config keys the guard reads, so tests
    do not hit the mock pool for them and the side_effect list stays
    focused on rubrique_confidence_run queries.
    """
    pc.reset_platform_config_cache()
    pc._CACHE["cross_rule_classifications_allowed"] = _CANONICAL_ALLOWED
    pc._CACHE["regalica_guard_field_classification_map"] = dict(_CANONICAL_FIELD_MAP)
    yield
    pc.reset_platform_config_cache()


def _output(
    *,
    incriminees: list[tuple[str, str]] | None = None,
    innocentees: list[tuple[str, str]] | None = None,
    indeterminees: list[tuple[str, str]] | None = None,
) -> InvestigatorOutput:
    payload: dict[str, Any] = {
        "cause_racine": "Erreur de mapping sur PA03 colonne C1.",
        "rubrique_incriminee": "PA03",
        "colonne_incriminee": "C1",
        "suggestion_correction": "Vérifier l'alimentation de la rubrique PA03.",
        "niveau_confiance": "medium",
        "explication_ecart": "L'écart de 21457.97 KTND provient d'une absorption manquante.",
    }
    if incriminees:
        payload["rubrique_incriminee_cells"] = [
            {"rubrique": r, "colonne": c} for r, c in incriminees
        ]
    if innocentees:
        payload["rubriques_innocentees_cells"] = [
            {"rubrique": r, "colonne": c} for r, c in innocentees
        ]
    if indeterminees:
        payload["rubriques_indeterminees_cells"] = [
            {"rubrique": r, "colonne": c} for r, c in indeterminees
        ]
    return InvestigatorOutput.model_validate(payload)


def _mock_pool(
    db_rows: list[dict[str, str]],
    guard_notice_static: str | None = None,
) -> MagicMock:
    """Build a pool whose fetch() returns rubrique_confidence_run rows
    and fetchrow() returns the prompt_bank row (or None) for the
    guard_notice template."""

    async def fake_fetch(query: str, *args: Any) -> list[dict[str, Any]]:
        if "FROM rubrique_confidence_run" in query:
            return db_rows
        return []

    async def fake_fetchrow(query: str, *args: Any) -> dict[str, Any] | None:
        if "FROM prompt_bank" in query and guard_notice_static is not None:
            return {
                "template": "guard notice template",
                "input_schema": {},
                "output_schema": {},
                "temperature": 0.0,
                "max_tokens": 256,
                "thinking_enabled": False,
                "target_model": "gemini-2.5-flash",
                "output_contract": "string",
                "static_response": guard_notice_static,
                "model_tier": "standard",
            }
        return None

    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=fake_fetch)
    pool.fetchrow = AsyncMock(side_effect=fake_fetchrow)
    return pool


# ─────────────────────────────────────────────────────────────────────
# Pass path
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pass_when_db_matches() -> None:
    """Every claim matches DB → valid, no corrections."""
    pool = _mock_pool(
        db_rows=[
            {"rubrique_code": "PA01", "colonne_code": "C1", "classification": _INNOCENT},
            {"rubrique_code": "PA02", "colonne_code": "C2", "classification": _SUSPECT},
            {"rubrique_code": "PA03", "colonne_code": "C3", "classification": _UNDETERMINED},
        ]
    )
    out = _output(
        incriminees=[("PA02", "C2")],
        innocentees=[("PA01", "C1")],
        indeterminees=[("PA03", "C3")],
    )
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    assert result.valid is True
    assert result.violations == ()
    assert result.corrected_output is None


@pytest.mark.asyncio
async def test_pass_when_no_claims() -> None:
    """Empty cell lists → valid by definition, no DB query needed."""
    pool = _mock_pool(db_rows=[])
    out = _output()  # all lists empty
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    assert result.valid is True
    # No rubrique_confidence_run lookup fired because there were no claims.
    pool.fetch.assert_not_awaited()


# ─────────────────────────────────────────────────────────────────────
# H1 — innocent claim that is actually suspect / undetermined
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fail_when_innocent_claim_is_actually_suspect() -> None:
    """Rejoue H1 (audit forensique 2026-05-12 sur run 019e1951-...) :
    le LLM a classé C10/C11/C12 de PA030302000001 dans
    `rubriques_innocentees_cells` alors que la DB pour ce run dit :
      C10 = innocent     ✓ correcte
      C11 = suspect      ✗ MENSONGE
      C12 = undetermined ✗ MENSONGE

    Le guard doit produire 2 violations et un corrected_output qui ne
    garde que C10 dans la liste innocentees.
    """
    pool = _mock_pool(
        db_rows=[
            {"rubrique_code": "PA030302000001", "colonne_code": "10", "classification": _INNOCENT},
            {"rubrique_code": "PA030302000001", "colonne_code": "11", "classification": _SUSPECT},
            {
                "rubrique_code": "PA030302000001",
                "colonne_code": "12",
                "classification": _UNDETERMINED,
            },
        ]
    )
    out = _output(
        innocentees=[
            ("PA030302000001", "10"),
            ("PA030302000001", "11"),
            ("PA030302000001", "12"),
        ]
    )
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    assert result.valid is False
    assert len(result.violations) == 2
    # Violations sorted by (field, rubrique, colonne) — C11 then C12.
    v11, v12 = result.violations
    assert v11.cell == CellRef(rubrique="PA030302000001", colonne="11")
    assert v11.expected == _INNOCENT
    assert v11.actual == _SUSPECT
    assert v12.cell == CellRef(rubrique="PA030302000001", colonne="12")
    assert v12.actual == _UNDETERMINED

    assert result.corrected_output is not None
    cleaned = result.corrected_output.rubriques_innocentees_cells
    assert len(cleaned) == 1
    assert cleaned[0] == CellRef(rubrique="PA030302000001", colonne="10")
    assert result.corrected_output.guard_notice is not None
    # Notice contains the filtered cells in a deterministic format.
    assert "PA030302000001/11" in result.corrected_output.guard_notice
    assert "PA030302000001/12" in result.corrected_output.guard_notice
    assert "PA030302000001/10" not in result.corrected_output.guard_notice


# ─────────────────────────────────────────────────────────────────────
# H2 — wrong-list attribution (suspect cell placed in innocentees)
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fail_when_suspect_attribution_to_wrong_rule() -> None:
    """Rejoue H2 reformulée pour la portée du guard :

    Le LLM affirme que 63099000000000/C10 est innocente (ou
    indéterminée) par cette règle, alors que la DB la classe suspect.
    Le guard ne lit PAS contributing_rule_ids ; il ne valide que la
    classification (suspect / innocent / undetermined). Quand le LLM
    place une cellule dans la mauvaise liste par rapport à sa classe
    DB, le guard catche l'erreur.
    """
    pool = _mock_pool(
        db_rows=[
            {"rubrique_code": "63099000000000", "colonne_code": "10", "classification": _SUSPECT},
        ]
    )
    out = _output(
        innocentees=[("63099000000000", "10")],
    )
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    assert result.valid is False
    assert len(result.violations) == 1
    (only,) = result.violations
    assert only.cell == CellRef(rubrique="63099000000000", colonne="10")
    assert only.field_name == "rubriques_innocentees_cells"
    assert only.expected == _INNOCENT
    assert only.actual == _SUSPECT
    assert result.corrected_output is not None
    assert result.corrected_output.rubriques_innocentees_cells == []


@pytest.mark.asyncio
async def test_fail_when_db_row_is_missing() -> None:
    """Cell claimed but absent from rubrique_confidence_run → violation
    with actual=None. The LLM cannot claim a cell that doesn't exist
    in the run's confidence snapshot."""
    pool = _mock_pool(db_rows=[])
    out = _output(incriminees=[("PA01", "C1")])
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    assert result.valid is False
    (only,) = result.violations
    assert only.actual is None
    assert only.expected == _SUSPECT


# ─────────────────────────────────────────────────────────────────────
# Notice text from prompt_bank
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_guard_notice_loaded_from_prompt_bank() -> None:
    """When the guard_notice_correction prompt is active, its
    static_response prefixes the corrected output's guard_notice."""
    template = (
        "Note : la classification de certaines cellules a été corrigée "
        "après vérification croisée avec la base de confiance. Cellules retirées :"
    )
    pool = _mock_pool(
        db_rows=[
            {"rubrique_code": "PA01", "colonne_code": "C1", "classification": _SUSPECT},
        ],
        guard_notice_static=template,
    )
    out = _output(innocentees=[("PA01", "C1")])
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    assert result.valid is False
    assert result.corrected_output is not None
    assert result.corrected_output.guard_notice is not None
    assert result.corrected_output.guard_notice.startswith(template.rstrip())
    assert "PA01/C1" in result.corrected_output.guard_notice


# ─────────────────────────────────────────────────────────────────────
# Fail-soft posture (config / SQL errors must not block the chat)
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fail_soft_when_classifications_config_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No platform_config row → log warning + return valid (skip guard)."""
    pc.reset_platform_config_cache()
    # Force the loader to raise PlatformConfigMissingError.
    pool = _mock_pool(db_rows=[])
    pool.fetchrow = AsyncMock(return_value=None)  # platform_config lookup → None
    out = _output(innocentees=[("PA01", "C1")])
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    assert result.valid is True
    assert result.corrected_output is None


@pytest.mark.asyncio
async def test_fail_soft_when_field_map_targets_unknown_classification() -> None:
    """Operator typoed the mapping → guard refuses to validate."""
    pc.reset_platform_config_cache()
    pc._CACHE["cross_rule_classifications_allowed"] = _CANONICAL_ALLOWED
    pc._CACHE["regalica_guard_field_classification_map"] = {
        "rubrique_incriminee_cells": "TYPO_CLASS",
    }
    pool = _mock_pool(db_rows=[])
    out = _output(incriminees=[("PA01", "C1")])
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    assert result.valid is True
    pool.fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_fail_soft_when_sql_raises() -> None:
    """Any DB exception → empty db_map → all claims look missing →
    violations, BUT only if the guard runs the SQL. The current
    implementation logs and returns empty dict on SQL exception, so
    actual=None for every claim → violations. Confirm this graceful
    degradation (no 500, just violations on every cell)."""
    pool = MagicMock()
    pool.fetch = AsyncMock(side_effect=RuntimeError("db down"))
    pool.fetchrow = AsyncMock(return_value=None)
    out = _output(incriminees=[("PA01", "C1")])
    result = await verify_investigator_against_db(out, pool=pool, run_id=_RUN, tenant_id=_TENANT)
    # The guard returns violations rather than 500 — fail-LOUD instead
    # of fail-silent. Caller decides whether to keep corrected_output
    # or fall back to original (orchestrator currently keeps the
    # corrected one).
    assert result.valid is False
    assert len(result.violations) == 1
    assert result.violations[0].actual is None


# ─────────────────────────────────────────────────────────────────────
# Structured violation surface
# ─────────────────────────────────────────────────────────────────────


def test_violation_is_frozen_dataclass() -> None:
    """`Violation` is a frozen dataclass — mutating it raises
    `dataclasses.FrozenInstanceError`."""
    from dataclasses import FrozenInstanceError

    v = Violation(
        cell=CellRef(rubrique="x", colonne="y"),
        field_name="rubrique_incriminee_cells",
        expected=_SUSPECT,
        actual=_INNOCENT,
    )
    with pytest.raises(FrozenInstanceError):
        v.cell = CellRef(rubrique="z", colonne="w")  # type: ignore[misc]


def test_guard_result_defaults() -> None:
    r = GuardResult(valid=True)
    assert r.violations == ()
    assert r.corrected_output is None


def test_module_imports_and_constants() -> None:
    """Guard module exports the platform_config key names as
    Final[str] constants so the migration owner and the code owner
    share one symbol."""
    assert guard._CLASSIFICATIONS_ALLOWED_KEY == "cross_rule_classifications_allowed"
    assert guard._FIELD_CLASSIFICATION_MAP_KEY == "regalica_guard_field_classification_map"
    assert guard._GUARD_NOTICE_FUNCTION_NAME == "guard_notice_correction"
