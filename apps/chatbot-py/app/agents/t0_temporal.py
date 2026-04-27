"""TemporalAgent — deterministic arrete-date validator.

Verifies that an `arrete_date` is the canonical end-of-period for
the declared `arrete_type` (monthly / quarterly / annual) and
returns the matching T-1 reference date.

Zero LLM, zero DB. Pure date arithmetic over `datetime.date`.

Supported `arrete_type` values:

  - "monthly"   — last day of the calendar month
  - "quarterly" — last day of Q1 (Mar 31), Q2 (Jun 30),
                   Q3 (Sep 30) or Q4 (Dec 31)
  - "annual"    — December 31

Any other `arrete_type` returns success=False with an explicit
`unsupported_arrete_type` error so callers never silently accept
an unknown periodicity.
"""

from __future__ import annotations

import time
from calendar import monthrange
from datetime import date
from typing import Any

from app.agents.base import AgentResult

_QUARTERLY_END_MONTHS: frozenset[int] = frozenset({3, 6, 9, 12})


class TemporalAgent:
    """Calendar-coherence validator for the batch `arrete_date`."""

    name: str = "t0_temporal"

    async def validate(
        self,
        arrete_date: str,
        arrete_type: str,
    ) -> AgentResult:
        """Return AgentResult.success=True only when the date matches the type."""
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

        if arrete_type == "monthly":
            expected_day = monthrange(current.year, current.month)[1]
            valid = current.day == expected_day
            previous_period = _previous_month_end(current)
        elif arrete_type == "quarterly":
            expected_day = monthrange(current.year, current.month)[1]
            valid = current.day == expected_day and current.month in _QUARTERLY_END_MONTHS
            previous_period = _previous_quarter_end(current)
        elif arrete_type == "annual":
            valid = current.month == 12 and current.day == 31
            previous_period = date(current.year - 1, 12, 31)
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


def _previous_quarter_end(d: date) -> date:
    """Last day of the quarter immediately preceding the one containing `d`."""
    quarter_index = (d.month - 1) // 3  # 0..3 for Q1..Q4
    if quarter_index == 0:
        prev_year = d.year - 1
        prev_month = 12
    else:
        prev_year = d.year
        prev_month = quarter_index * 3
    last_day = monthrange(prev_year, prev_month)[1]
    return date(prev_year, prev_month, last_day)
