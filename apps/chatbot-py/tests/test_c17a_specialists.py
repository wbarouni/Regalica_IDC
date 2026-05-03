"""C17a contract tests — BaseSpecialistAgent ABC, T2 adapter, library agents.

Three blocks:
  - Inheritance (6) : every specialist (3 T2 existing + 3 library
                       sample) inherits BaseSpecialistAgent.
  - T2 delegation (3) : execute() forwards to the legacy method
                         (find_source / analyze / compare) without
                         altering its surface.
  - Library execute (6) : each new library agent calls
                          _invoke_specialist_json with the documented
                          payload shape and wraps the parsed dict in
                          AgentResult(success=True).
  - _SpecialistContext (2) : api_client default None preserved;
                              api_client passed survives the dataclass.
  - _SPECIALIST_INVOKERS (7) : the 6 new keys + one regression check
                                that the existing investigator entry
                                still resolves.

No DB / no network — every external is mocked via AsyncMock.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agents.base import AgentResult
from app.agents.base_specialist import BaseSpecialistAgent
from app.agents.library.diff_narrate import DiffNarrateAgent
from app.agents.library.referential_ingestor_pdf import ReferentialIngestorPdfAgent
from app.agents.library.reporter_docx import ReporterDocxAgent
from app.agents.library.reporter_pdf import ReporterPdfAgent
from app.agents.library.rule_form_assist import RuleFormAssistAgent
from app.agents.library.visualizer_chart import VisualizerChartAgent
from app.agents.t2 import CitationAgent, HistoricalAgent, InvestigatorAgent
from app.services.orchestrator import _SPECIALIST_INVOKERS, _SpecialistContext

_TENANT_ID = "bbbbbbbb-0000-7000-8000-000000000001"
_RUN_ID = "aaaaaaaa-0000-7000-8000-000000000001"


def _meta(template: str = "TPL") -> dict[str, Any]:
    """Minimal PromptMeta-shaped dict the library specialists consume."""
    return {
        "template": template,
        "temperature": 0.3,
        "max_tokens": 1024,
        "thinking_enabled": False,
        "target_model": "gemini-2.5-flash",
        "output_contract": "json",
        "static_response": None,
        "model_tier": "standard",
    }


def _ctx(
    fail_context: dict[str, Any] | None = None,
    rule_context: dict[str, Any] | None = None,
    current_run_id: str | None = _RUN_ID,
    api_client: Any = None,
) -> _SpecialistContext:
    return _SpecialistContext(
        pool=MagicMock(),
        tenant_id=_TENANT_ID,
        llm_client=MagicMock(),
        fail_context=fail_context,
        rule_context=rule_context,
        current_run_id=current_run_id,
        api_client=api_client,
    )


# ---------------------------------------------------------------------------
# Inheritance
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "agent_cls",
    [
        CitationAgent,
        InvestigatorAgent,
        HistoricalAgent,
        ReporterDocxAgent,
        ReporterPdfAgent,
        VisualizerChartAgent,
        DiffNarrateAgent,
        ReferentialIngestorPdfAgent,
        RuleFormAssistAgent,
    ],
)
def test_agent_inherits_base_specialist(agent_cls: type) -> None:
    assert issubclass(agent_cls, BaseSpecialistAgent)


# ---------------------------------------------------------------------------
# T2 delegation — execute() must forward to the legacy surface
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_citation_execute_delegates_to_find_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = CitationAgent()
    sentinel = AgentResult(agent_name="t2_citation", success=True, output={"ok": 1})
    mock_find = AsyncMock(return_value=sentinel)
    monkeypatch.setattr(agent, "find_source", mock_find)

    result = await agent.execute(_ctx(rule_context={"r": "x"}), _meta())

    assert result is sentinel
    mock_find.assert_awaited_once()
    kwargs = mock_find.call_args.kwargs
    assert kwargs["rule"] == {"r": "x"}
    assert kwargs["temperature"] == 0.3


@pytest.mark.asyncio
async def test_investigator_execute_delegates_to_analyze(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = InvestigatorAgent()
    sentinel = AgentResult(agent_name="t2_investigator", success=True, output={"why": "x"})
    mock_analyze = AsyncMock(return_value=sentinel)
    monkeypatch.setattr(agent, "analyze", mock_analyze)

    result = await agent.execute(
        _ctx(fail_context={"f": 1}, rule_context={"r": 2}),
        _meta(),
    )

    assert result is sentinel
    kwargs = mock_analyze.call_args.kwargs
    assert kwargs["fail"] == {"f": 1}
    assert kwargs["rule"] == {"r": 2}


@pytest.mark.asyncio
async def test_historical_execute_delegates_to_compare(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    agent = HistoricalAgent()
    sentinel = AgentResult(agent_name="t2_historical", success=True, output={"trend": "stable"})
    mock_compare = AsyncMock(return_value=sentinel)
    monkeypatch.setattr(agent, "compare", mock_compare)

    result = await agent.execute(_ctx(), _meta())

    assert result is sentinel
    kwargs = mock_compare.call_args.kwargs
    assert kwargs["current_run_id"] == _RUN_ID
    assert kwargs["tenant_id"] == _TENANT_ID


# ---------------------------------------------------------------------------
# Library execute — must call _invoke_specialist_json and wrap the dict
# ---------------------------------------------------------------------------


_LIBRARY_AGENTS_AND_FAIL_CTX: list[tuple[type[BaseSpecialistAgent], dict[str, Any]]] = [
    (ReporterDocxAgent, {"report_type": "livrable_b", "total_pass": 50}),
    (ReporterPdfAgent, {"report_type": "livrable_c", "total_pass": 50}),
    (VisualizerChartAgent, {"chart_type": "heatmap", "total_pass": 0}),
    (DiffNarrateAgent, {"run_id_a": "run-a", "delta_kpis": {"x": 1}}),
    (ReferentialIngestorPdfAgent, {"target_referential": "rubriques"}),
    (RuleFormAssistAgent, {"natural_language_rule": "Si x alors y"}),
]


@pytest.mark.parametrize(("agent_cls", "fail_ctx"), _LIBRARY_AGENTS_AND_FAIL_CTX)
@pytest.mark.asyncio
async def test_library_agent_execute_wraps_invoke_specialist_json(
    agent_cls: type[BaseSpecialistAgent],
    fail_ctx: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    parsed_json = {"echoed": "ok", "agent": agent_cls.__name__}
    mock_invoke = AsyncMock(return_value=parsed_json)
    monkeypatch.setattr("app.services.orchestrator._invoke_specialist_json", mock_invoke)

    agent = agent_cls()
    result = await agent.execute(_ctx(fail_context=fail_ctx), _meta())

    assert result.success is True
    assert result.error is None
    assert result.output == parsed_json
    mock_invoke.assert_awaited_once()


# ---------------------------------------------------------------------------
# _SpecialistContext extension
# ---------------------------------------------------------------------------


def test_specialist_context_default_api_client_is_none() -> None:
    ctx = _SpecialistContext(
        pool=MagicMock(),
        tenant_id=_TENANT_ID,
        llm_client=MagicMock(),
        fail_context=None,
        rule_context=None,
        current_run_id=None,
    )
    assert ctx.api_client is None


def test_specialist_context_preserves_api_client_when_provided() -> None:
    sentinel = MagicMock(name="api_client")
    ctx = _SpecialistContext(
        pool=MagicMock(),
        tenant_id=_TENANT_ID,
        llm_client=MagicMock(),
        fail_context=None,
        rule_context=None,
        current_run_id=None,
        api_client=sentinel,
    )
    assert ctx.api_client is sentinel


# ---------------------------------------------------------------------------
# _SPECIALIST_INVOKERS dispatch table
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "specialist_id",
    [
        "reporter_docx",
        "reporter_pdf",
        "visualizer_chart",
        "diff_narrate",
        "referential_ingestor_pdf",
        "rule_form_assist",
    ],
)
def test_specialist_invokers_carries_new_library_id(specialist_id: str) -> None:
    assert specialist_id in _SPECIALIST_INVOKERS


def test_specialist_invokers_keeps_existing_t2_keys() -> None:
    """Regression guard — C17a must NOT remove the 3 T2 entries."""
    for legacy in ("investigator", "citation", "historical"):
        assert legacy in _SPECIALIST_INVOKERS
