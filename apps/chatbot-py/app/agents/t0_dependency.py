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

        output: dict[str, Any] = {
            "primary_annexe": primary_annexe,
            "required": required,
            "missing": missing,
            "autonomous": len(required) == 0,
        }
        return AgentResult(
            agent_name=self.name,
            success=True,
            output=output,
            latency_ms=int((time.monotonic() - start) * 1000),
        )
