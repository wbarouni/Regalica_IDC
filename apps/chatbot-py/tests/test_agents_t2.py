"""Unit tests for the three T2 LLM-backed agents.

LLMClient is replaced with an AsyncMock returning a canned
LLMResponse; asyncpg.Pool is replaced with a MagicMock whose
`fetch` is an AsyncMock. No network, no DB.
"""

from __future__ import annotations

import json
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agents import AgentResult
from app.agents.t2 import CitationAgent, HistoricalAgent, InvestigatorAgent
from app.llm.base import LLMRequest, LLMResponse


def _llm_response(content: str) -> LLMResponse:
    return LLMResponse(
        content=content,
        thinking_trace=None,
        tokens_input=20,
        tokens_output=10,
        tokens_thinking=0,
        latency_ms=50,
        model_used="gemini-2.5-flash",
    )


def _mock_llm(content: str | Exception) -> MagicMock:
    client = MagicMock()
    if isinstance(content, Exception):
        client.complete = AsyncMock(side_effect=content)
    else:
        client.complete = AsyncMock(return_value=_llm_response(content))
    return client


def _fail_fixture() -> dict[str, Any]:
    return {
        "annexeCode": "139",
        "numRegle": 3,
        "lhs": "1966",
        "rhs": "8232",
        "gap": "6266",
        "operRegle": "=",
    }


def _rule_fixture() -> dict[str, Any]:
    return {
        "axTerm": "139",
        "numRegle": 3,
        "naturalLanguage": "Total = sum of subcategories.",
        "typeCtrl": "intra_ax",
    }


# ---------------------------------------------------------------------------
# InvestigatorAgent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_investigator_passes_template_and_payload_to_llm() -> None:
    llm = _mock_llm(
        json.dumps(
            {
                "cause_racine": "ventilation_sectorielle_incorrecte",
                "rubrique_incriminee": "13006470000000",
                "suggestion_correction": "Revoir le mapping rubrique-source.",
                "niveau_confiance": "high",
                "citations": [],
            }
        )
    )
    agent = InvestigatorAgent()
    result: AgentResult = await agent.analyze(
        fail=_fail_fixture(),
        rule=_rule_fixture(),
        llm_client=llm,
        prompt_template="[INVESTIGATOR_ANALYZE_FAIL_V1]",
        temperature=0.3,
        max_tokens=4096,
        thinking_enabled=False,
    )
    assert result.success is True
    assert result.output["cause_racine"] == "ventilation_sectorielle_incorrecte"
    llm.complete.assert_awaited_once()
    sent_request: LLMRequest = llm.complete.call_args.args[0]
    assert sent_request.system_prompt == "[INVESTIGATOR_ANALYZE_FAIL_V1]"
    assert sent_request.temperature == 0.3
    assert sent_request.max_tokens == 4096
    payload = json.loads(sent_request.prompt)
    assert payload["fail"]["annexeCode"] == "139"
    assert payload["rule"]["axTerm"] == "139"


@pytest.mark.asyncio
async def test_investigator_reports_failure_on_invalid_json() -> None:
    llm = _mock_llm("this is not json at all")
    agent = InvestigatorAgent()
    result = await agent.analyze(
        fail=_fail_fixture(),
        rule=_rule_fixture(),
        llm_client=llm,
        prompt_template="[INVESTIGATOR_ANALYZE_FAIL_V1]",
        temperature=0.3,
        max_tokens=2048,
        thinking_enabled=False,
    )
    assert result.success is False
    assert result.error is not None
    # New error message reflects the fence-tolerant `extract_first_json`
    # path: when the LLM returns prose that contains no JSON object at
    # all, the helper returns None and the agent surfaces the canonical
    # "no parseable JSON object" error.
    assert "no parseable JSON" in result.error


@pytest.mark.asyncio
async def test_investigator_reports_failure_on_llm_exception() -> None:
    llm = _mock_llm(RuntimeError("upstream LLM rate limited"))
    agent = InvestigatorAgent()
    result = await agent.analyze(
        fail=_fail_fixture(),
        rule=_rule_fixture(),
        llm_client=llm,
        prompt_template="[INVESTIGATOR_ANALYZE_FAIL_V1]",
        temperature=0.3,
        max_tokens=2048,
        thinking_enabled=False,
    )
    assert result.success is False
    assert result.error is not None
    assert "LLM call failed" in result.error
    assert "rate limited" in result.error


# ---------------------------------------------------------------------------
# CitationAgent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_citation_returns_parsed_output_on_happy_path() -> None:
    llm = _mock_llm(
        json.dumps(
            {
                "circulaire": "circ-2018-06",
                "article": "art-7",
                "paragraphe": "§3",
                "texte_pertinent": "Les fonds propres réglementaires...",
                "confidence": "high",
            }
        )
    )
    agent = CitationAgent()
    result = await agent.find_source(
        rule=_rule_fixture(),
        llm_client=llm,
        prompt_template="[CITATION_FIND_REGULATORY_SOURCE_V1]",
        temperature=0.3,
        max_tokens=2048,
        thinking_enabled=False,
    )
    assert result.success is True
    assert result.output["circulaire"] == "circ-2018-06"
    assert result.output["article"] == "art-7"


@pytest.mark.asyncio
async def test_citation_injects_rule_payload_into_prompt() -> None:
    llm = _mock_llm(json.dumps({"circulaire": "x", "confidence": "low"}))
    agent = CitationAgent()
    await agent.find_source(
        rule=_rule_fixture(),
        llm_client=llm,
        prompt_template="[CITATION_FIND_REGULATORY_SOURCE_V1]",
        temperature=0.3,
        max_tokens=2048,
        thinking_enabled=False,
    )
    sent_request: LLMRequest = llm.complete.call_args.args[0]
    payload = json.loads(sent_request.prompt)
    assert payload["rule"]["naturalLanguage"] == "Total = sum of subcategories."


# ---------------------------------------------------------------------------
# HistoricalAgent
# ---------------------------------------------------------------------------


def _mock_pool_with_runs(rows: list[dict[str, Any]]) -> MagicMock:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=rows)
    return pool


@pytest.mark.asyncio
async def test_historical_compares_and_calls_llm() -> None:
    pool = _mock_pool_with_runs(
        [
            {
                "id": "11111111-1111-1111-1111-111111111111",
                "arrete_date": "2024-09-30",
                "total_fail_severe": 4,
                "total_fail_rounding": 0,
                "conformity_rate": 0.85,
            },
            {
                "id": "22222222-2222-2222-2222-222222222222",
                "arrete_date": "2024-12-31",
                "total_fail_severe": 57,
                "total_fail_rounding": 22,
                "conformity_rate": 0.72,
            },
        ]
    )
    llm = _mock_llm(
        json.dumps(
            {
                "tendance": "deterioration",
                "delta_fail_severe": 53,
                "commentaire": "Le run actuel présente une nette dégradation.",
                "runs_compares": ["...", "..."],
            }
        )
    )
    agent = HistoricalAgent()
    result = await agent.compare(
        current_run_id="33333333-3333-3333-3333-333333333333",
        tenant_id="00000000-0000-0000-0000-000000000001",
        pool=pool,
        llm_client=llm,
        prompt_template="[HISTORICAL_COMPARE_RUNS_HISTORY_V1]",
        temperature=0.5,
        max_tokens=4096,
        thinking_enabled=False,
    )
    assert result.success is True
    assert result.output["tendance"] == "deterioration"
    assert result.output["delta_fail_severe"] == 53
    llm.complete.assert_awaited_once()
    sent_request: LLMRequest = llm.complete.call_args.args[0]
    payload = json.loads(sent_request.prompt)
    assert len(payload["previous_runs"]) == 2
    assert payload["current_run_id"] == "33333333-3333-3333-3333-333333333333"


@pytest.mark.asyncio
async def test_historical_returns_stable_when_no_previous_runs() -> None:
    pool = _mock_pool_with_runs([])
    llm = _mock_llm("not used")
    agent = HistoricalAgent()
    result = await agent.compare(
        current_run_id="33333333-3333-3333-3333-333333333333",
        tenant_id="00000000-0000-0000-0000-000000000001",
        pool=pool,
        llm_client=llm,
        prompt_template="[HISTORICAL_COMPARE_RUNS_HISTORY_V1]",
        temperature=0.5,
        max_tokens=4096,
        thinking_enabled=False,
    )
    assert result.success is True
    assert result.output["tendance"] == "stable"
    assert result.output["delta_fail_severe"] == 0
    assert result.output["runs_compares"] == []
    llm.complete.assert_not_awaited()
