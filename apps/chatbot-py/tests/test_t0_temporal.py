"""Unit tests for TemporalAgent — calendar-driven validation."""

from __future__ import annotations

from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.agents.t0_temporal import TemporalAgent
from app.services import platform_config as pc


@pytest.fixture(autouse=True)
def _reset_cache() -> Iterator[None]:
    pc.reset_platform_config_cache()
    yield
    pc.reset_platform_config_cache()


def _seed_calendar(quarterly: list[int], annual_month: int = 12, annual_day: int = 31) -> None:
    pc._CACHE["temporal_arrete_calendar"] = {
        "quarterly_end_months": quarterly,
        "annual_month": annual_month,
        "annual_day": annual_day,
    }


@pytest.fixture
def pool() -> MagicMock:
    """Pool stand-in. The cache fixture means fetchrow is rarely hit."""
    p = MagicMock()
    p.fetchrow = AsyncMock(return_value=None)
    return p


@pytest.mark.asyncio
async def test_quarterly_default_calendar_accepts_q1_end(pool: MagicMock) -> None:
    _seed_calendar([3, 6, 9, 12])
    res = await TemporalAgent().validate("2026-03-31", "quarterly", pool)
    assert res.success and res.output["valid"] is True
    assert res.output["previous_period_date"] == "2025-12-31"


@pytest.mark.asyncio
async def test_quarterly_rejects_february_end(pool: MagicMock) -> None:
    _seed_calendar([3, 6, 9, 12])
    res = await TemporalAgent().validate("2026-02-28", "quarterly", pool)
    assert res.success and res.output["valid"] is False


@pytest.mark.asyncio
async def test_quarterly_calendar_extension_makes_february_valid(pool: MagicMock) -> None:
    """Operator extends the calendar to include month 2 -> Feb-end becomes valid."""
    _seed_calendar([2, 3, 6, 9, 12])
    res = await TemporalAgent().validate("2026-02-28", "quarterly", pool)
    assert res.success and res.output["valid"] is True
    # Previous period should be the next-lower month in the calendar < 2 -> wrap to year-1's 12
    assert res.output["previous_period_date"] == "2025-12-31"


@pytest.mark.asyncio
async def test_annual_default_calendar_accepts_dec_31(pool: MagicMock) -> None:
    _seed_calendar([3, 6, 9, 12])
    res = await TemporalAgent().validate("2026-12-31", "annual", pool)
    assert res.success and res.output["valid"] is True
    assert res.output["previous_period_date"] == "2025-12-31"


@pytest.mark.asyncio
async def test_annual_calendar_override_accepts_jun_30(pool: MagicMock) -> None:
    """Tenant on a non-calendar fiscal year — operator sets annual to (6, 30)."""
    _seed_calendar([3, 6, 9, 12], annual_month=6, annual_day=30)
    res = await TemporalAgent().validate("2026-06-30", "annual", pool)
    assert res.success and res.output["valid"] is True
    assert res.output["previous_period_date"] == "2025-06-30"


@pytest.mark.asyncio
async def test_monthly_validates_last_day_regardless_of_calendar(pool: MagicMock) -> None:
    _seed_calendar([3, 6, 9, 12])
    res = await TemporalAgent().validate("2026-04-30", "monthly", pool)
    assert res.success and res.output["valid"] is True


@pytest.mark.asyncio
async def test_unknown_arrete_type_returns_failure(pool: MagicMock) -> None:
    _seed_calendar([3, 6, 9, 12])
    res = await TemporalAgent().validate("2026-03-31", "weekly", pool)
    assert res.success is False
    assert res.error and "weekly" in res.error


@pytest.mark.asyncio
async def test_invalid_date_string_returns_failure(pool: MagicMock) -> None:
    _seed_calendar([3, 6, 9, 12])
    res = await TemporalAgent().validate("not-a-date", "quarterly", pool)
    assert res.success is False
    assert res.error and "invalid arrete_date" in res.error


@pytest.mark.asyncio
async def test_calendar_load_failure_surfaces_as_agent_failure(pool: MagicMock) -> None:
    """Pool returns no row -> PlatformConfigMissingError -> agent failure."""
    pool.fetchrow = AsyncMock(return_value=None)
    res = await TemporalAgent().validate("2026-03-31", "quarterly", pool)
    assert res.success is False
    assert res.error and "temporal calendar load failed" in res.error
