"""Common agent contract.

`AgentResult` is the uniform output of every agent — deterministic
or LLM-backed. The orchestrator chains agents by inspecting
`success` and `output`, never by reading provider-specific types.

Latency is captured per-call so observability traces always include
duration regardless of whether the agent did a network call (LLM /
DB) or pure CPU work (XML parse, date arithmetic).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class AgentResult:
    """Uniform agent output. Frozen to keep the contract immutable."""

    agent_name: str
    success: bool
    output: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    latency_ms: int = 0
