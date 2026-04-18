"""LLM abstraction — provider-agnostic interface.

Strategy per ADR 0002: start with Gemini, migrate to Ollama (Qwen 2.5 3B)
for sovereignty + cost predictability. Switch is driven by LLM_PROVIDER env.
"""

from typing import Any, Protocol, runtime_checkable

from pydantic import BaseModel, Field


class LLMResponse(BaseModel):
    """Canonical response envelope for every LLM call.

    The ``citations`` list is enforced by a guardrail middleware (Phase 4):
    every item must map to a real ``kb_chunks.id`` in the knowledge base.
    Responses with ``confidence < 0.95`` on critical topics are rejected.
    """

    text: str
    citations: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    tokens_used: int = Field(ge=0)
    latency_ms: int = Field(ge=0)
    model_id: str


@runtime_checkable
class LLMClient(Protocol):
    """Minimal contract every LLM adapter must implement."""

    async def generate(
        self,
        system: str,
        user: str,
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int = 2000,
    ) -> LLMResponse: ...
