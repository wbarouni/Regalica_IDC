"""Base agent abstractions — all LLM agents inherit from BaseAgent.

Guardrail rules (§10.2):
- Every LLMResponse must carry ≥ 1 citation.
- Confidence < 0.95 on critical responses is rejected immediately.
"""

from __future__ import annotations

import time
from abc import abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal

from app.llm.base import LLMClient, LLMResponse


@dataclass
class AgentContext:
    """Runtime context threaded through each agent call."""

    tenant_id: str
    run_id: str | None = None
    user_id: str | None = None


@dataclass
class AgentResult:
    """Canonical output envelope returned by every agent."""

    status: Literal["success", "failure", "partial"]
    output: dict[str, Any]
    citations: list[str]
    confidence: float
    tokens_used: int
    latency_ms: int
    error: str | None = field(default=None)


class BaseAgent:
    """Abstract base — all LLM agents inherit this.

    Subclasses must:
    - Set ``agent_id`` as a class-level string.
    - Implement ``execute()``.

    The ``_validate_response`` guardrail is called after every LLM round-trip.
    """

    agent_id: str = "base"
    version: str = "0.1.0"

    def __init__(self, llm: LLMClient) -> None:
        self._llm = llm

    @abstractmethod
    async def execute(
        self,
        input_data: dict[str, Any],
        ctx: AgentContext,
    ) -> AgentResult: ...

    # ------------------------------------------------------------------
    # Guardrail helpers
    # ------------------------------------------------------------------

    def _validate_response(self, resp: LLMResponse, *, critical: bool = True) -> None:
        """Raise ``ValueError`` if guardrails are violated.

        Rules:
        1. ``resp.citations`` must be non-empty (grounding requirement).
        2. When *critical* is True, ``resp.confidence`` must be ≥ 0.95.
        """
        if not resp.citations:
            raise ValueError(
                f"[{self.agent_id}] LLM response has no citations — guardrail violated"
            )
        if critical and resp.confidence < 0.95:
            raise ValueError(
                f"[{self.agent_id}] Confidence {resp.confidence:.3f} < 0.95 — response rejected"
            )

    # ------------------------------------------------------------------
    # Timing helper
    # ------------------------------------------------------------------

    @staticmethod
    def _now_ms() -> int:
        """Current monotonic time in milliseconds."""
        return int(time.monotonic() * 1000)
