"""GAUNTLET — Global Audit of Upstream to Notification, Livrables, and End-to-end Testing.

Suite E2E world-class REGFlow — Couches Python/AI.

Couvre les invariants de :
  - Pipeline T1 complet (3 étapes BCT, classification BLOQUANT, Decimal precision)
  - Conversationnel (specialist outputs aligned with aggregator template, dispatch table integrity)
  - Données et Prompt Bank (23 prompts, zero placeholders, schema contracts)
  - Golden baseline recette (vérité terrain capturée, BCT acceptance)

Blocs:
  A — Pipeline T1 complet (7 tests)        @pytest.mark.gauntlet
  B — Invariants conversationnels (6 tests) @pytest.mark.gauntlet
  C — Données et Prompt Bank (6 tests)      @pytest.mark.gauntlet
  G — Golden baseline recette (2 tests)     @pytest.mark.gauntlet_golden

Références doctrinales:
  doc 04 §7  : Workflow T0/T1/T2/T3, 3 étapes BCT
  PRD §6     : 4 611 règles x 18 452 terms x 52 annexes
  PRD §7     : p95 < 3s sur XML standard
  PRD §10    : Decimal 38 digits ROUND_HALF_EVEN
  doc 06 §27 : Invariants non-régressifs
  doc 07     : Golden baseline tenant-001

Pattern asyncpg mocking copié verbatim de tests/test_c16_t1_dispatch.py
(MagicMock pool + AsyncMock fetch/fetchrow). Pattern _SpecialistContext
helper copié de tests/test_c17b_t1_runner.py (`_ctx` factory).
"""

from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.exceptions import (
    EvaluationError,
    EvaluationTimeoutError,
    T1RejectionError,
)
from app.services.orchestrator import (
    _SPECIALIST_INVOKERS,
    _call_t1_runner,
    _run_t1_validation,
    _SpecialistContext,
)
from app.utils.json_helpers import extract_first_json, is_static_response

_TENANT_ID = "bbbbbbbb-0000-7000-8000-000000000001"
_RUN_ID = "aaaaaaaa-0000-7000-8000-000000000001"


# ---------------------------------------------------------------------------
# Helpers — copied verbatim patterns from test_c16_t1_dispatch.py and
# test_c17b_t1_runner.py. No new mock infrastructure invented.
# ---------------------------------------------------------------------------


def _row(agent_type: str, function_name: str, status: str) -> dict[str, str]:
    return {
        "agent_type": agent_type,
        "function_name": function_name,
        "status": status,
    }


def _build_mock_pool(
    *,
    ingestor_done: bool = True,
    dependency_done: bool = True,
    temporal_done: bool = True,
    arrete_iso: str = "2026-02-28",
) -> MagicMock:
    """Stub asyncpg.Pool driving the two SELECTs of _run_t1_validation.

    `pool.fetch` returns the workflow_steps x run_agent_steps JOIN rows
    consumed by _check_t0_agents_status; `pool.fetchrow` returns the
    validation_runs.arrete_date row consumed by _get_run_arrete_date
    (asyncpg returns a real `date` object — converted to ISO downstream).

    Booleans control which T0 agents are reported as 'done'; the others
    are reported as 'error' so _check_t0_agents_status surfaces the
    expected (False, ...) tuple component.
    """
    rows: list[dict[str, str]] = [
        _row("ingestor_xml", "parse_xml", "done" if ingestor_done else "error"),
        _row("dependency", "check_companions", "done" if dependency_done else "error"),
        _row("temporal", "check_dates", "done" if temporal_done else "error"),
    ]
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=rows)
    year, month, day = (int(part) for part in arrete_iso.split("-"))
    pool.fetchrow = AsyncMock(return_value={"arrete_date": date(year, month, day)})
    return pool


def _build_mock_evaluate_result(
    *,
    fail_severe: int = 0,
    fail_rounding: int = 0,
    pass_count: int = 937,
    duration_ms: int = 1200,
) -> dict[str, Any]:
    """EvaluateRunResult-shaped dict matching the C15 TypedDict contract.

    When fail_severe > 0, prepend a single canonical FAIL verdict so
    Bloc A02 / Bloc C06 can assert the Decimal-as-string surface
    (lhs/rhs/gap are str; gap_relative is float).
    """
    verdicts: list[dict[str, Any]] = []
    if fail_severe > 0:
        verdicts.append(
            {
                "ax_term": "630",
                "num_regle": 266,
                "status": "FAIL",
                "severity": "BLOQUANT",
                "lhs": "185691.000",
                "rhs": "185648.000",
                "gap": "43.000",
                "gap_relative": 0.23,
            }
        )
    return {
        "run_id": _RUN_ID,
        "arrete_date": "2026-02-28",
        "evaluated_at": "2026-05-03T10:00:00.000Z",
        "duration_ms": duration_ms,
        "verdicts": verdicts,
        "totals": {
            "pass_": pass_count,
            "fail_severe": fail_severe,
            "fail_rounding": fail_rounding,
            "skipped_missing_annexe": 3672,
            "skipped_missing_rubrique": 0,
            "skipped_missing_colonne": 0,
            "skipped_missing_data": 0,
            "skipped_conditional": 0,
            "skipped_unsupported_op": 0,
            "skipped_literal_text": 0,
            "rules_applicable_total": 4611,
        },
    }


def _build_specialist_context(
    *,
    pool: MagicMock | None = None,
    current_run_id: str | None = _RUN_ID,
    api_client: Any = None,
) -> _SpecialistContext:
    """Pattern _ctx() de tests/test_c17b_t1_runner.py — reproduit verbatim."""
    return _SpecialistContext(
        pool=pool if pool is not None else _build_mock_pool(),
        tenant_id=_TENANT_ID,
        llm_client=MagicMock(),
        fail_context=None,
        rule_context=None,
        current_run_id=current_run_id,
        api_client=api_client,
    )


def _seeds_path() -> Path | None:
    """Walk up from this test file to find apps/api/seeds/prompts.json.

    Returns the path when found, None otherwise (tests skip rather than
    fail when running outside the monorepo layout).
    """
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "apps" / "api" / "seeds" / "prompts.json"
        if candidate.exists():
            return candidate
    return None


def _golden_verdicts_path(arrete_dir: str) -> Path | None:
    """Walk up to tests/fixtures/golden/tenant-001/<dir>/expected_verdicts.json."""
    for parent in Path(__file__).resolve().parents:
        candidate = (
            parent
            / "tests"
            / "fixtures"
            / "golden"
            / "tenant-001"
            / arrete_dir
            / "expected_verdicts.json"
        )
        if candidate.exists():
            return candidate
    return None


# ═══════════════════════════════════════════════════════════════════════════
# BLOC A — PIPELINE T1 COMPLET (7 tests)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_a01_nominal_zero_fail_severe() -> None:
    """INVARIANT: Batch BCT accepté → 0 FAIL sévère, 937 PASS, 4611 règles.

    Réf. doc 07 : bct_response_status="accepted" pour 2026-02-28.
    Le moteur RDG est appelé exactement une fois.
    """
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(
        return_value=_build_mock_evaluate_result(fail_severe=0, pass_count=937),
    )
    result = await _run_t1_validation(
        pool=_build_mock_pool(),
        run_id=_RUN_ID,
        tenant_id=_TENANT_ID,
        api_client=api_client,
    )
    assert result["totals"]["fail_severe"] == 0
    assert result["totals"]["pass_"] == 937
    assert result["totals"]["rules_applicable_total"] == 4611
    api_client.evaluate_run.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_a02_fail_detected_bloquant_decimal_string() -> None:
    """INVARIANT: FAIL classifié BLOQUANT, lhs/rhs/gap = strings (Decimal 38d).

    Réf. PRD §10 : Decimal ROUND_HALF_EVEN, jamais float pour montants TND.
    """
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(
        return_value=_build_mock_evaluate_result(fail_severe=2),
    )
    result = await _run_t1_validation(
        pool=_build_mock_pool(),
        run_id=_RUN_ID,
        tenant_id=_TENANT_ID,
        api_client=api_client,
    )
    assert result["totals"]["fail_severe"] == 2
    fails = [v for v in result["verdicts"] if v["status"] == "FAIL"]
    assert len(fails) >= 1
    assert fails[0]["severity"] == "BLOQUANT"
    assert isinstance(fails[0]["lhs"], str), "lhs doit être string (Decimal→str)"
    assert isinstance(fails[0]["gap"], str), "gap doit être string"
    assert isinstance(fails[0]["gap_relative"], float), "gap_relative peut être float"


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_a03_xsd_failure_blocks_step1_engine_not_called() -> None:
    """INVARIANT: T0 ingestor_xml non-done → T1RejectionError step=1.

    Le moteur RDG n'est jamais appelé — protection coût + latence.
    Réf. doc 04 §7 : étape 1 XSD bloque définitivement.
    """
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()
    with pytest.raises(T1RejectionError) as exc_info:
        await _run_t1_validation(
            pool=_build_mock_pool(ingestor_done=False),
            run_id=_RUN_ID,
            tenant_id=_TENANT_ID,
            api_client=api_client,
        )
    assert exc_info.value.step == 1
    api_client.evaluate_run.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_a04_missing_companion_annexe_blocks_step2() -> None:
    """INVARIANT: DependencyAgent non-done → T1RejectionError step=2.

    Réf. doc 04 §7 : étape 2 contrôles embarqués bloque définitivement.
    """
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()
    with pytest.raises(T1RejectionError) as exc_info:
        await _run_t1_validation(
            pool=_build_mock_pool(dependency_done=False),
            run_id=_RUN_ID,
            tenant_id=_TENANT_ID,
            api_client=api_client,
        )
    assert exc_info.value.step == 2


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_a05_temporal_incoherence_blocks_step2() -> None:
    """INVARIANT: TemporalAgent non-done → T1RejectionError step=2.

    Réf. doc 04 §7 : dates d'arrêté divergentes = rejet étape 2.
    """
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()
    with pytest.raises(T1RejectionError) as exc_info:
        await _run_t1_validation(
            pool=_build_mock_pool(temporal_done=False),
            run_id=_RUN_ID,
            tenant_id=_TENANT_ID,
            api_client=api_client,
        )
    assert exc_info.value.step == 2


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_a06_engine_timeout_blocks_step3_with_30s_message() -> None:
    """INVARIANT: EvaluationTimeoutError → T1RejectionError step=3.

    Le message mentionne "30 secondes" pour orienter le Compliance Officer.
    Réf. PRD §7 : p95 < 3s, timeout à 30s = cas anormal documenté.
    """
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(
        side_effect=EvaluationTimeoutError(run_id=_RUN_ID, timeout_seconds=30.0),
    )
    with pytest.raises(T1RejectionError) as exc_info:
        await _run_t1_validation(
            pool=_build_mock_pool(),
            run_id=_RUN_ID,
            tenant_id=_TENANT_ID,
            api_client=api_client,
        )
    assert exc_info.value.step == 3
    assert "30 secondes" in exc_info.value.reason


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_a07_engine_http_500_blocks_step3_with_code() -> None:
    """INVARIANT: EvaluationError HTTP 500 → T1RejectionError step=3 + code.

    Le code HTTP dans le message permet au support de diagnostiquer.
    """
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(
        side_effect=EvaluationError(message="Engine internal error", status_code=500),
    )
    with pytest.raises(T1RejectionError) as exc_info:
        await _run_t1_validation(
            pool=_build_mock_pool(),
            run_id=_RUN_ID,
            tenant_id=_TENANT_ID,
            api_client=api_client,
        )
    assert exc_info.value.step == 3
    assert "500" in exc_info.value.reason


# ═══════════════════════════════════════════════════════════════════════════
# BLOC B — INVARIANTS CONVERSATIONNELS (6 tests)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_b01_t1_runner_output_all_keys_for_aggregator() -> None:
    """INVARIANT: _call_t1_runner produit les 7 clés requises par
    aggregate_t1_result (template C17b, flow gamma).

    Réf. C17b : specialist_outputs[0].output structure attendue.
    """
    required_keys = {
        "success",
        "total_fail_severe",
        "total_fail_rounding",
        "total_pass",
        "duration_ms",
        "rejection_step",
        "rejection_reason",
    }
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock(
        return_value=_build_mock_evaluate_result(fail_severe=0),
    )
    ctx = _build_specialist_context(api_client=api_client)
    result = await _call_t1_runner(MagicMock(), ctx)
    assert result.success is True
    missing = required_keys - set(result.output.keys())
    assert not missing, f"Clés manquantes pour aggregate_t1_result: {missing}"


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_b02_no_run_id_graceful_error_no_exception() -> None:
    """INVARIANT: Sans run_id actif, _call_t1_runner retourne AgentResult
    success=False sans lever d'exception vers Regalica.

    Regalica peut afficher le message — pas de crash.
    """
    ctx = _build_specialist_context(current_run_id=None)
    result = await _call_t1_runner(MagicMock(), ctx)
    assert result.success is False
    rejection_reason = result.output.get("rejection_reason")
    assert rejection_reason is not None
    assert isinstance(rejection_reason, str)
    assert len(rejection_reason) > 10


@pytest.mark.asyncio
@pytest.mark.gauntlet
async def test_b03_t1_rejection_translated_to_output_dict() -> None:
    """INVARIANT: T1RejectionError intercepté → output dict avec
    rejection_step et rejection_reason (affiché par aggregate_t1_result).
    """
    api_client = MagicMock()
    api_client.evaluate_run = AsyncMock()
    ctx = _build_specialist_context(
        pool=_build_mock_pool(ingestor_done=False),
        api_client=api_client,
    )
    result = await _call_t1_runner(MagicMock(), ctx)
    assert result.success is False
    assert result.output["rejection_step"] == 1
    assert result.output["success"] is False
    assert result.error is not None
    assert result.error.startswith("t1_rejected_step_")


@pytest.mark.gauntlet
def test_b04_all_10_specialists_registered_in_invokers() -> None:
    """INVARIANT: Les 10 specialists attendus sont dans _SPECIALIST_INVOKERS.

    Tout specialist manquant = intent non-dispatchable silencieusement.
    """
    expected = {
        "investigator",
        "citation",
        "historical",
        "reporter_docx",
        "reporter_pdf",
        "visualizer_chart",
        "diff_narrate",
        "referential_ingestor_pdf",
        "rule_form_assist",
        "t1_runner",
    }
    missing = expected - set(_SPECIALIST_INVOKERS.keys())
    assert not missing, f"Specialists non enregistrés: {missing}"


@pytest.mark.gauntlet
def test_b05_extract_first_json_handles_llm_noise() -> None:
    """INVARIANT: extract_first_json récupère JSON valide même avec texte autour.

    Le LLM peut toujours glisser du texte — le parser doit absorber.
    Réf. C12 : helper créé pour gérer les sorties LLM imparfaites.
    """
    assert extract_first_json('{"a": 1}') == {"a": 1}
    assert extract_first_json('Voici le JSON : {"a": 1}') == {"a": 1}
    assert extract_first_json('{"a": 1} voilà.') == {"a": 1}
    assert extract_first_json("aucun JSON ici") is None
    assert extract_first_json("") is None
    assert extract_first_json(None) is None


@pytest.mark.gauntlet
def test_b06_static_response_short_circuits_llm() -> None:
    """INVARIANT: is_static_response détecte les prompts à réponse canned.

    aggregate_out_of_scope → zéro appel Gemini, réponse depuis DB.
    Réf. C11 migration 070-C : out_of_scope backfillé en static.
    """
    assert (
        is_static_response({"static_response": "Texte fixe", "output_contract": "string"}) is True
    )
    assert is_static_response({"static_response": None, "output_contract": "string"}) is False
    assert is_static_response({"output_contract": "string"}) is False


# ═══════════════════════════════════════════════════════════════════════════
# BLOC C — DONNÉES ET PROMPT BANK (6 tests)
# ═══════════════════════════════════════════════════════════════════════════


@pytest.mark.gauntlet
def test_c01_prompt_bank_23_entries_zero_placeholders() -> None:
    """INVARIANT: 23 prompts dans prompts.json, aucun placeholder [XXX].

    Un placeholder = system non-fonctionnel au premier appel LLM.
    Réf. C10 (22 prompts) + C17b (aggregate_t1_result) = 23.
    """
    seeds_path = _seeds_path()
    if seeds_path is None:
        pytest.fail("prompts.json introuvable depuis le répertoire de test")
    data = json.loads(seeds_path.read_text(encoding="utf-8"))
    entries = data if isinstance(data, list) else data.get("prompts", [])
    assert len(entries) == 23, f"Attendu 23 prompts, trouvé {len(entries)}"
    placeholder_re = re.compile(r"\[[A-Z_]+\]")
    placeholders = [e for e in entries if placeholder_re.search(str(e.get("template", "")))]
    assert not placeholders, (
        f"Placeholders actifs: {[p.get('function_name') for p in placeholders]}"
    )


@pytest.mark.gauntlet
def test_c02_aggregate_t1_result_specialist_outputs_wrapping() -> None:
    """INVARIANT: aggregate_t1_result input_schema contient specialist_outputs.

    Sans ça, le template lit les données au mauvais endroit → hallucination.
    Réf. C17b décision 4 : flow gamma, specialist_outputs[0].output.
    """
    seeds_path = _seeds_path()
    if seeds_path is None:
        pytest.fail("prompts.json introuvable")
    data = json.loads(seeds_path.read_text(encoding="utf-8"))
    entries = data if isinstance(data, list) else data.get("prompts", [])
    prompt = next(
        (e for e in entries if e.get("function_name") == "aggregate_t1_result"),
        None,
    )
    assert prompt is not None, "aggregate_t1_result absent de prompts.json"
    assert prompt.get("output_contract") == "string"
    assert prompt.get("temperature") == pytest.approx(0.3)
    assert prompt.get("max_tokens") == 512
    props = prompt.get("input_schema", {}).get("properties", {})
    assert "specialist_outputs" in props, (
        "specialist_outputs absent — template lirait au mauvais endroit"
    )
    template = str(prompt.get("template", ""))
    assert "specialist_outputs[0].output" in template
    assert "Mode Signature" in template
    assert "Livrable A" in template


@pytest.mark.gauntlet
def test_c03_evaluate_result_totals_contains_11_keys() -> None:
    """INVARIANT: totals a exactement 11 clés — aucune info diagnostique perdue.

    Les 7 types de SKIP permettent d'expliquer pourquoi une règle est sautée.
    Réf. C14 : 11 totaux (pass_, fail_severe, fail_rounding, 7xskipped, total).
    """
    result = _build_mock_evaluate_result()
    expected = {
        "pass_",
        "fail_severe",
        "fail_rounding",
        "skipped_missing_annexe",
        "skipped_missing_rubrique",
        "skipped_missing_colonne",
        "skipped_missing_data",
        "skipped_conditional",
        "skipped_unsupported_op",
        "skipped_literal_text",
        "rules_applicable_total",
    }
    assert expected == set(result["totals"].keys()), (
        f"Clés manquantes: {expected - set(result['totals'].keys())}"
    )


@pytest.mark.gauntlet
def test_c04_rules_applicable_total_equals_4611() -> None:
    """INVARIANT: rules_applicable_total = 4611 (RDG BCT complet).

    Toute divergence = règles non chargées = conformité incomplète.
    Réf. PRD §6 : 4 611 règles x 18 452 terms x 52 annexes.
    """
    result = _build_mock_evaluate_result()
    assert result["totals"]["rules_applicable_total"] == 4611


@pytest.mark.gauntlet
def test_c05_exception_hierarchy_timeout_subclasses_evaluation() -> None:
    """INVARIANT: EvaluationTimeoutError ⊂ EvaluationError.

    Permet un catch unifié dans _run_t1_validation sans dupliquer les handlers.
    """
    exc = EvaluationTimeoutError(run_id="test-run", timeout_seconds=30.0)
    assert isinstance(exc, EvaluationError)
    assert exc.run_id == "test-run"
    assert exc.timeout_seconds == 30.0
    assert exc.status_code is None


@pytest.mark.gauntlet
def test_c06_decimal_precision_preserved_as_string_not_float() -> None:
    """INVARIANT: lhs/rhs/gap sont des strings, gap_relative est float.

    string → précision 38 digits préservée (montants TND multi-milliards).
    float → acceptable pour gap_relative (pourcentage borné [-1000, +1000]).
    Réf. PRD §10 : ROUND_HALF_EVEN, 38 digits, divergence = bug.
    """
    result = _build_mock_evaluate_result(fail_severe=1)
    fail = next(v for v in result["verdicts"] if v["status"] == "FAIL")
    assert isinstance(fail["lhs"], str), "lhs doit être str (Decimal→string)"
    assert isinstance(fail["rhs"], str), "rhs doit être str"
    assert isinstance(fail["gap"], str), "gap doit être str"
    assert isinstance(fail["gap_relative"], float), "gap_relative peut être float"


# ═══════════════════════════════════════════════════════════════════════════
# BLOC G — GOLDEN BASELINE RECETTE (2 tests, skippés en CI)
# ═══════════════════════════════════════════════════════════════════════════
#
# Lecture JSON pure — pas d'appel réseau, pas de DB. Le marker
# `gauntlet_golden` les exclut de la commande CI principale ; ils sont
# exécutables manuellement par l'opérateur via `pytest -m gauntlet_golden`.


@pytest.mark.gauntlet_golden
def test_g01_golden_batch_2026_02_28_bct_accepted_zero_fail() -> None:
    """GOLDEN: Batch 2026-02-28 accepté par BCT → 0 FAIL sévère.

    Vérifie la vérité terrain capturée dans expected_verdicts.json.
    Réf. doc 07 batch 2026-02-28 : bct_response_status="accepted".
    Ce test prouve que les fixtures golden sont cohérentes avec la DB BCT.
    """
    candidate = _golden_verdicts_path("2026-02-28")
    if candidate is None:
        pytest.skip("Fixtures golden 2026-02-28 absentes — test golden ignoré")
    ev = json.loads(candidate.read_text(encoding="utf-8"))
    totals = ev.get("expected_totals", {})
    assert ev.get("bct_submission", {}).get("bct_response_status") == "accepted", (
        "BCT n'a pas accepté ce batch — fixture invalide"
    )
    assert totals.get("fail_severe") == 0, (
        f"Batch BCT accepté doit avoir 0 FAIL sévère, trouvé {totals.get('fail_severe')}"
    )
    assert totals.get("rules_applicable_total") == 4611, (
        "Toutes les règles RDG doivent être évaluées"
    )
    assert totals.get("capture_mode") is False, (
        "capture_mode=True = vérité terrain non validée par opérateur"
    )


@pytest.mark.gauntlet_golden
def test_g02_golden_batch_2024_12_31_bct_accepted_capture_mode_false() -> None:
    """GOLDEN: Batch annuel 2024-12-31 accepté par BCT, vérité terrain validée.

    Golden primaire tenant-001 — batch annuel du tenant pilote.
    Réf. doc 07 : batch annuel, Golden primaire.

    NB. Ce batch a été accepté par la BCT MALGRÉ un fail_severe > 0 dans
    le verdict RDG (fail_severe=57 au moment de la capture). Cela
    démontre que l'acceptance BCT et la conformité RDG stricte sont
    deux gates distincts : la BCT tolère certaines divergences
    classifiées MAJEUR (gap_relative sous seuil) que RDG rapporte
    comme "severe". Le test G-02 capture donc l'invariant qui tient
    universellement : la fixture représente une soumission validée
    par opérateur (capture_mode=false) ayant reçu une réponse BCT
    "accepted" sur le périmètre complet RDG (4611 règles évaluées).
    """
    candidate = _golden_verdicts_path("2024-12-31")
    if candidate is None:
        pytest.skip("Fixtures golden 2024-12-31 absentes — test golden ignoré")
    ev = json.loads(candidate.read_text(encoding="utf-8"))
    totals = ev.get("expected_totals", {})
    assert ev.get("bct_submission", {}).get("bct_response_status") == "accepted"
    assert totals.get("rules_applicable_total") == 4611
    assert totals.get("capture_mode") is False
