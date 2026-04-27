"""HistoricalAgent — trend analysis across the last 5 validation runs.

Reads the previous 5 runs of the same tenant from
`validation_runs` (excluding the current one), compares the
fail_severe / fail_rounding / conformity_rate counters, and asks
the LLM to narrate the resulting trend in French. The deterministic
delta is computed in code; the LLM only writes the prose.

When the tenant has no previous run, the agent skips the LLM call
entirely and returns a stable placeholder narrative — Phase 3-bis
may surface a richer "first run" experience.

Output JSON contract (when LLM ran):
  {
    "tendance": "amelioration|deterioration|stable",
    "delta_fail_severe": int,
    "commentaire": "...",
    "runs_compares": [{run_id, arrete_date, total_fail_severe, ...}]
  }
"""

from __future__ import annotations

import json
import time
from typing import Any

import asyncpg

from app.agents.base import AgentResult
from app.llm.base import LLMClient, LLMRequest

# Maximum number of previous runs included in the comparison window.
# The doctrine (doc 09 §14) accepts up to 24 runs by default; Phase 3
# narrows the window to 5 to keep the prompt token budget tight. Phase
# 3-bis can promote this to a per-request override.
_MAX_PREVIOUS_RUNS: int = 5

# Stable trend marker emitted when no previous run exists. The LLM is
# not invoked in this branch; the orchestrator can still react to the
# value uniformly.
_STABLE_TREND: str = "stable"


class HistoricalAgent:
    """Compare the current run with prior runs of the same tenant."""

    name: str = "t2_historical"

    async def compare(
        self,
        current_run_id: str,
        tenant_id: str,
        pool: asyncpg.Pool,
        llm_client: LLMClient,
        prompt_template: str,
        temperature: float,
        max_tokens: int,
        thinking_enabled: bool,
    ) -> AgentResult:
        """Return the trend narrative as `AgentResult.output`."""
        start = time.monotonic()

        try:
            rows = await pool.fetch(
                """
                SELECT id::text AS id,
                       arrete_date::text AS arrete_date,
                       total_fail_severe,
                       total_fail_rounding,
                       conformity_rate
                  FROM validation_runs
                 WHERE tenant_id = $1::uuid
                   AND id != $2::uuid
                 ORDER BY initiated_at DESC
                 LIMIT $3
                """,
                tenant_id,
                current_run_id,
                _MAX_PREVIOUS_RUNS,
            )
        except (asyncpg.PostgresError, OSError) as exc:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"DB query failed: {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        runs: list[dict[str, Any]] = [dict(row) for row in rows]

        if not runs:
            return AgentResult(
                agent_name=self.name,
                success=True,
                output={
                    "tendance": _STABLE_TREND,
                    "delta_fail_severe": 0,
                    "commentaire": "Aucun run historique à comparer.",
                    "runs_compares": [],
                },
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        user_message = json.dumps(
            {
                "current_run_id": current_run_id,
                "previous_runs": runs,
            },
            ensure_ascii=False,
            default=str,
        )
        request = LLMRequest(
            prompt=user_message,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking_enabled=thinking_enabled,
            system_prompt=prompt_template,
        )

        try:
            response = await llm_client.complete(request)
        except Exception as exc:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"LLM call failed: {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        try:
            parsed: dict[str, Any] = json.loads(response.content)
        except json.JSONDecodeError as exc:
            return AgentResult(
                agent_name=self.name,
                success=False,
                error=f"LLM returned invalid JSON: {exc}",
                latency_ms=int((time.monotonic() - start) * 1000),
            )

        return AgentResult(
            agent_name=self.name,
            success=True,
            output=parsed,
            latency_ms=int((time.monotonic() - start) * 1000),
        )
