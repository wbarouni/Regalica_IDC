"""Unit tests for the three T0 deterministic agents.

Pure in-process: no DB (DependencyAgent uses an AsyncMock pool),
no LLM, no XML on disk.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agents import (
    AgentResult,
    DependencyAgent,
    IngestorXMLAgent,
    TemporalAgent,
)

_VALID_XML = """<?xml version="1.0" encoding="UTF-8"?>
<root>
  <Entete>
    <CodeBanque>BANK-CODE</CodeBanque>
    <DateAnnexe>20240930</DateAnnexe>
    <CodeAnnexe>139</CodeAnnexe>
  </Entete>
  <Annexe id="139">
    <Rubrique id="13006410000000">
      <Colonne id="1">647.000</Colonne>
    </Rubrique>
    <Rubrique id="13006420000000">
      <Colonne id="1">0.000</Colonne>
    </Rubrique>
  </Annexe>
</root>
"""

_MALFORMED_XML = "<root><Entete><CodeAnnexe>"

_NO_ENTETE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<root>
  <Annexe id="00"/>
</root>
"""


# ---------------------------------------------------------------------------
# IngestorXMLAgent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ingestor_parses_valid_xml() -> None:
    agent = IngestorXMLAgent()
    result: AgentResult = await agent.ingest(_VALID_XML)
    assert result.success is True
    assert result.error is None
    assert result.output["code_banque"] == "BANK-CODE"
    assert result.output["code_annexe"] == "139"
    assert result.output["date_annexe"] == "2024-09-30"
    assert result.output["rubriques_count"] == 2
    assert result.latency_ms >= 0


@pytest.mark.asyncio
async def test_ingestor_reports_failure_on_malformed_xml() -> None:
    agent = IngestorXMLAgent()
    result = await agent.ingest(_MALFORMED_XML)
    assert result.success is False
    assert result.error is not None
    assert "parse" in result.error.lower()


@pytest.mark.asyncio
async def test_ingestor_reports_failure_when_entete_missing() -> None:
    agent = IngestorXMLAgent()
    result = await agent.ingest(_NO_ENTETE_XML)
    assert result.success is False
    assert result.error is not None
    assert "Entete" in result.error


# ---------------------------------------------------------------------------
# DependencyAgent
# ---------------------------------------------------------------------------


def _mock_pool_with_dependencies(rows: list[dict[str, str]]) -> MagicMock:
    pool = MagicMock()
    pool.fetch = AsyncMock(return_value=rows)
    return pool


@pytest.mark.asyncio
async def test_dependency_reports_no_missing_when_all_companions_present() -> None:
    pool = _mock_pool_with_dependencies(
        [
            {
                "target_annexe_code": "00",
                "dependency_type": "structural",
                "source_circulaire": "circ-2018-06",
                "source_article": "art-7",
            },
            {
                "target_annexe_code": "01",
                "dependency_type": "structural",
                "source_circulaire": "circ-2018-06",
                "source_article": "art-8",
            },
        ]
    )
    agent = DependencyAgent()
    result = await agent.check(
        primary_annexe="47",
        available_annexes=["47", "00", "01"],
        pool=pool,
        tenant_id="00000000-0000-0000-0000-000000000001",
    )
    assert result.success is True
    assert result.output["missing"] == []
    assert len(result.output["required"]) == 2
    assert result.output["autonomous"] is False


@pytest.mark.asyncio
async def test_dependency_reports_missing_companion_when_absent() -> None:
    pool = _mock_pool_with_dependencies(
        [
            {
                "target_annexe_code": "00",
                "dependency_type": "structural",
                "source_circulaire": "circ-2018-06",
                "source_article": "art-7",
            },
            {
                "target_annexe_code": "51",
                "dependency_type": "computational",
                "source_circulaire": "circ-2018-10",
                "source_article": "art-3",
            },
        ]
    )
    agent = DependencyAgent()
    result = await agent.check(
        primary_annexe="47",
        available_annexes=["47", "00"],
        pool=pool,
        tenant_id="00000000-0000-0000-0000-000000000001",
    )
    assert result.success is True
    missing_codes = [m["annexe_code"] for m in result.output["missing"]]
    assert missing_codes == ["51"]
    assert result.output["autonomous"] is False


@pytest.mark.asyncio
async def test_dependency_marks_autonomous_when_no_companions_required() -> None:
    pool = _mock_pool_with_dependencies([])
    agent = DependencyAgent()
    result = await agent.check(
        primary_annexe="139",
        available_annexes=["139"],
        pool=pool,
        tenant_id="00000000-0000-0000-0000-000000000001",
    )
    assert result.success is True
    assert result.output["autonomous"] is True
    assert result.output["missing"] == []


# ---------------------------------------------------------------------------
# TemporalAgent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_temporal_accepts_monthly_end_of_month() -> None:
    agent = TemporalAgent()
    result = await agent.validate("2024-09-30", "monthly")
    assert result.success is True
    assert result.output["valid"] is True
    assert result.output["previous_period_date"] == "2024-08-31"


@pytest.mark.asyncio
async def test_temporal_rejects_monthly_mid_month() -> None:
    agent = TemporalAgent()
    result = await agent.validate("2024-09-15", "monthly")
    assert result.success is True
    assert result.output["valid"] is False
    assert result.output["previous_period_date"] == "2024-08-31"


@pytest.mark.asyncio
async def test_temporal_accepts_quarterly_end_of_quarter() -> None:
    agent = TemporalAgent()
    result = await agent.validate("2024-09-30", "quarterly")
    assert result.success is True
    assert result.output["valid"] is True
    assert result.output["previous_period_date"] == "2024-06-30"


@pytest.mark.asyncio
async def test_temporal_rejects_quarterly_non_quarter_month() -> None:
    agent = TemporalAgent()
    result = await agent.validate("2024-08-31", "quarterly")
    assert result.success is True
    assert result.output["valid"] is False


@pytest.mark.asyncio
async def test_temporal_accepts_annual_dec_31() -> None:
    agent = TemporalAgent()
    result = await agent.validate("2025-12-31", "annual")
    assert result.success is True
    assert result.output["valid"] is True
    assert result.output["previous_period_date"] == "2024-12-31"


@pytest.mark.asyncio
async def test_temporal_rejects_unsupported_arrete_type() -> None:
    agent = TemporalAgent()
    result = await agent.validate("2024-09-30", "weekly")
    assert result.success is False
    assert result.error is not None
    assert "unsupported" in result.error.lower()


@pytest.mark.asyncio
async def test_temporal_rejects_invalid_iso_date() -> None:
    agent = TemporalAgent()
    result = await agent.validate("not-a-date", "monthly")
    assert result.success is False
    assert result.error is not None
    assert "invalid arrete_date" in result.error
