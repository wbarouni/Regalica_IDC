"""Unit tests for `_build_thinking_trace` — Sprint A enhancements.

Pure in-process: no DB, no LLM, no asyncio. The function is a pure
text composer that takes the orchestration metadata + optional
specialist outcomes and returns the 4- or 5-phase Regalica thinking
trace surfaced to the frontend.
"""

from __future__ import annotations

from app.services.orchestrator import _build_thinking_trace, _SpecialistOutcome


def test_build_thinking_trace_renders_4_phases_when_no_outcomes() -> None:
    """Without specialist outcomes the trace stops after Phase 4 (Décision)."""
    trace = _build_thinking_trace(
        message="Bonjour",
        intent="general_help",
        specialist_ids=[],
        aggregator_label="regalica/aggregate_general_help",
    )
    assert trace.startswith("1 · Compréhension de la demande")
    assert "2 · Options considérées" in trace
    assert "3 · Arbitrages" in trace
    assert "4 · Décision" in trace
    assert "5 · Synthèse" not in trace


def test_build_thinking_trace_appends_phase_5_when_outcomes_provided() -> None:
    """A non-empty `specialist_outcomes` triggers the Phase 5 audit trail."""
    outcomes = [
        _SpecialistOutcome(
            bearer_label="investigator/analyze_fail",
            output={
                "cause_racine": "Erreur de mapping dans le référentiel rubriques",
                "rubrique_incriminee": "AC010000000000",
                "niveau_confiance": "high",
            },
            success=True,
        ),
        _SpecialistOutcome(
            bearer_label="citation/find_regulatory_source",
            output={"circulaire": "BCT 2018-08", "article": "3"},
            success=True,
        ),
    ]
    trace = _build_thinking_trace(
        message="regarde le FAIL 27",
        intent="zoom",
        specialist_ids=["investigator", "citation"],
        aggregator_label="regalica/aggregate_zoom_fail",
        specialist_outcomes=outcomes,
    )
    assert "5 · Synthèse des spécialistes consultés" in trace
    assert "investigator/analyze_fail" in trace
    assert "Erreur de mapping" in trace
    assert "AC010000000000" in trace
    assert "BCT 2018-08" in trace


def test_build_thinking_trace_surfaces_specialist_failures_explicitly() -> None:
    """Failed specialists land in Phase 5 with their error message."""
    outcomes = [
        _SpecialistOutcome(
            bearer_label="investigator/analyze_fail",
            output={},
            success=False,
            error="LLM returned no parseable JSON object",
        )
    ]
    trace = _build_thinking_trace(
        message="regarde le FAIL X",
        intent="zoom",
        specialist_ids=["investigator"],
        aggregator_label="regalica/aggregate_zoom_fail",
        specialist_outcomes=outcomes,
    )
    assert "→ échec" in trace
    assert "no parseable JSON" in trace


def test_build_thinking_trace_includes_router_confidence_in_phase_1() -> None:
    """When router confidence is supplied it shows alongside the intent."""
    trace = _build_thinking_trace(
        message="hi",
        intent="general_help",
        specialist_ids=[],
        aggregator_label="regalica/aggregate_general_help",
        router_confidence=0.92,
    )
    # Confidence rendered with 2 decimals.
    assert "confiance routeur 0.92" in trace


def test_build_thinking_trace_omits_phase_5_when_outcomes_empty_list() -> None:
    """An empty list is treated the same as None — no audit trail."""
    trace = _build_thinking_trace(
        message="bonjour",
        intent="general_help",
        specialist_ids=[],
        aggregator_label="regalica/aggregate_general_help",
        specialist_outcomes=[],
    )
    assert "5 · Synthèse" not in trace
