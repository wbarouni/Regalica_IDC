"""DependencyAgent — deterministic companion-annexe checker.

Reads the active `referentials_annexe_dependencies` rows for the
given primary annexe and reports which target annexes are missing
from the declared `available_annexes` list.

Zero LLM. Single SQL query against the dependencies referential.
The matrix is sourced from BCT CC-tech §9.5 + circulars 2018-06 /
2018-10 and lives in the DB so the doctrine evolves without a
code change (4-eyes promotion required).
"""

from __future__ import annotations

import time
from typing import Any

import asyncpg

from app.agents.base import AgentResult


class DependencyAgent:
    """Companion-annexe presence check against the dependencies referential."""

    name: str = "t0_dependency"

    async def check(
        self,
        primary_annexe: str,
        available_annexes: list[str],
        pool: asyncpg.Pool,
        tenant_id: str,
    ) -> AgentResult:
        """Return an AgentResult listing required and missing companions."""
        start = time.monotonic()
        try:
            rows = await pool.fetch(
                """
                SELECT target_annexe_code,
                       dependency_type,
                       source_circulaire,
                       source_article
                  FROM referentials_annexe_dependencies
                 WHERE tenant_id = $1::uuid
                   AND source_annexe_code = $2
                   AND status = 'active'
                   AND deleted_at IS NULL
                """,
                tenant_id,
                primary_annexe,
            )
        except (asyncpg.PostgresError, OSError) as exc:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"DB query failed: {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        available_set = set(available_annexes)
        required: list[dict[str, Any]] = []
        missing: list[dict[str, Any]] = []
        for row in rows:
            target = row["target_annexe_code"]
            entry: dict[str, Any] = {
                "annexe_code": target,
                "dependency_type": row["dependency_type"],
                "source_circulaire": row["source_circulaire"],
                "source_article": row["source_article"],
            }
            required.append(entry)
            if target not in available_set:
                missing.append(entry)

        # P4 — Count the cross-XML rules that would FAIL parasitically
        # if the validation runs without the missing companions. The
        # count is sourced from `rules_active`: a rule is parasitically
        # affected when it is `is_inter_annexe = true` AND any of its
        # `involved_annexes` references the missing annexe code (the
        # primary is always present by construction).
        parasitic_fail_count = 0
        if missing:
            missing_codes = [m["annexe_code"] for m in missing if m["annexe_code"] is not None]
            try:
                parasitic_row = await pool.fetchrow(
                    """
                    SELECT COUNT(*)::int AS cnt
                      FROM rules_active
                     WHERE tenant_id      = $1::uuid
                       AND is_inter_annexe = TRUE
                       AND involved_annexes && $2::text[]
                       AND $3 = ANY(involved_annexes)
                    """,
                    tenant_id,
                    missing_codes,
                    primary_annexe,
                )
                parasitic_fail_count = (
                    int(parasitic_row["cnt"]) if parasitic_row is not None else 0
                )
            except (asyncpg.PostgresError, OSError):
                # Defensive: a query failure on the parasitic-count
                # subqueries must NOT mask the dependency check itself.
                # We collapse to 0 so the briefing renders without the
                # count rather than failing the whole T0 step.
                parasitic_fail_count = 0

        output: dict[str, Any] = {
            "primary_annexe": primary_annexe,
            "required": required,
            "missing": missing,
            "autonomous": len(required) == 0,
            "parasitic_fail_count": parasitic_fail_count,
        }
        return AgentResult(
            agent_name=self.name,
            success=True,
            output=output,
            latency_ms=int((time.monotonic() - start) * 1000),
        )
