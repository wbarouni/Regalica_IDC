"""TemporalAgent — deterministic arrete-date validator.

Verifies that an `arrete_date` is the canonical end-of-period for
the declared `arrete_type` (monthly / quarterly / annual) and
returns the matching T-1 reference date.

The calendar of canonical periods (which months close a quarterly
report, which (month, day) closes the annual one) lives in
`platform_config.temporal_arrete_calendar` — operator-controlled,
seeded by migration 062. The agent reads it through the cached
`load_platform_config_value` helper and never carries a frozen
literal of its own.

Supported `arrete_type` values:

  - "monthly"   — last day of the calendar month
  - "quarterly" — last day of one of `quarterly_end_months` from the
                   calendar config
  - "annual"    — `annual_month` / `annual_day` from the calendar config

Any other `arrete_type` returns success=False with an explicit
`unsupported_arrete_type` error so callers never silently accept
an unknown periodicity.
"""

from __future__ import annotations

import time
from calendar import monthrange
from datetime import date
from typing import Any

import asyncpg

from app.agents.base import AgentResult
from app.services.platform_config import (
    PlatformConfigShapeError,
    load_platform_config_value,
)

_CALENDAR_CONFIG_KEY = "temporal_arrete_calendar"


class TemporalCalendar:
    """Typed view over the platform_config temporal_arrete_calendar JSONB."""

    __slots__ = ("annual_day", "annual_month", "quarterly_end_months")

    def __init__(
        self,
        quarterly_end_months: tuple[int, ...],
        annual_month: int,
        annual_day: int,
    ) -> None:
        self.quarterly_end_months = quarterly_end_months
        self.annual_month = annual_month
        self.annual_day = annual_day


def _parse_calendar(raw: Any) -> TemporalCalendar:
    """Validate the JSONB shape and return a typed TemporalCalendar."""
    if not isinstance(raw, dict):
        raise PlatformConfigShapeError(_CALENDAR_CONFIG_KEY, "object", raw)
    months_raw = raw.get("quarterly_end_months")
    if not isinstance(months_raw, list) or not months_raw:
        raise PlatformConfigShapeError(
            _CALENDAR_CONFIG_KEY,
            "quarterly_end_months: non-empty array of 1..12",
            months_raw,
        )
    months: list[int] = []
    for m in months_raw:
        if not isinstance(m, int) or m < 1 or m > 12:
            raise PlatformConfigShapeError(
                _CALENDAR_CONFIG_KEY,
                "quarterly_end_months[i]: integer 1..12",
                m,
            )
        months.append(m)
    annual_month = raw.get("annual_month")
    annual_day = raw.get("annual_day")
    if not isinstance(annual_month, int) or annual_month < 1 or annual_month > 12:
        raise PlatformConfigShapeError(
            _CALENDAR_CONFIG_KEY, "annual_month: integer 1..12", annual_month
        )
    if not isinstance(annual_day, int) or annual_day < 1:
        raise PlatformConfigShapeError(
            _CALENDAR_CONFIG_KEY, "annual_day: positive integer", annual_day
        )
    # Reference year only used to validate annual_day fits annual_month.
    max_day = monthrange(2024, annual_month)[1]
    if annual_day > max_day:
        raise PlatformConfigShapeError(
            _CALENDAR_CONFIG_KEY,
            f"annual_day must be 1..{max_day} for annual_month={annual_month}",
            annual_day,
        )
    return TemporalCalendar(
        quarterly_end_months=tuple(sorted(months)),
        annual_month=annual_month,
        annual_day=annual_day,
    )


async def load_calendar(pool: asyncpg.Pool) -> TemporalCalendar:
    """Load + validate the calendar from platform_config (cached)."""
    raw = await load_platform_config_value(pool, _CALENDAR_CONFIG_KEY)
    return _parse_calendar(raw)


class TemporalAgent:
    """Calendar-coherence validator for the batch `arrete_date`."""

    name: str = "t0_temporal"

    async def validate(
        self,
        arrete_date: str,
        arrete_type: str,
        pool: asyncpg.Pool,
    ) -> AgentResult:
        """Return AgentResult.success=True only when the date matches the type.

        The valid calendar is read from platform_config — see
        migration 062 + load_calendar above. The pool argument is the
        same async DB pool the route handler already passes around;
        accessing it here removes the prior frozen-set literal.
        """
        start = time.monotonic()

        try:
            current = date.fromisoformat(arrete_date)
        except ValueError as exc:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"invalid arrete_date (expected ISO YYYY-MM-DD): {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        try:
            calendar = await load_calendar(pool)
        except Exception as exc:  # surface every config error explicitly
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"temporal calendar load failed: {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        if arrete_type == "monthly":
            expected_day = monthrange(current.year, current.month)[1]
            valid = current.day == expected_day
            previous_period = _previous_month_end(current)
        elif arrete_type == "quarterly":
            expected_day = monthrange(current.year, current.month)[1]
            valid = (
                current.day == expected_day and current.month in calendar.quarterly_end_months
            )
            previous_period = _previous_quarterly_end(current, calendar.quarterly_end_months)
        elif arrete_type == "annual":
            valid = current.month == calendar.annual_month and current.day == calendar.annual_day
            previous_period = date(current.year - 1, calendar.annual_month, calendar.annual_day)
        else:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"unsupported arrete_type: {arrete_type!r}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        output: dict[str, Any] = {
            "arrete_date": arrete_date,
            "arrete_type": arrete_type,
            "valid": valid,
            "previous_period_date": previous_period.isoformat(),
        }
        return AgentResult(
            agent_name=self.name,
            success=True,
            output=output,
            latency_ms=int((time.monotonic() - start) * 1000),
        )


def _previous_month_end(d: date) -> date:
    """Last day of the calendar month immediately preceding `d`."""
    if d.month == 1:
        prev_year = d.year - 1
        prev_month = 12
    else:
        prev_year = d.year
        prev_month = d.month - 1
    last_day = monthrange(prev_year, prev_month)[1]
    return date(prev_year, prev_month, last_day)


def _previous_quarterly_end(d: date, quarterly_end_months: tuple[int, ...]) -> date:
    """Last day of the most recent canonical quarter end strictly before `d`.

    Searches the configured `quarterly_end_months` (sorted ascending)
    for the largest entry < d.month; if none in the current year, wraps
    to the largest entry of the previous year.
    """
    earlier = [m for m in quarterly_end_months if m < d.month]
    if earlier:
        prev_year = d.year
        prev_month = earlier[-1]
    else:
        prev_year = d.year - 1
        prev_month = quarterly_end_months[-1]
    last_day = monthrange(prev_year, prev_month)[1]
    return date(prev_year, prev_month, last_day)
