"""Provider-agnostic LLM contract.

`LLMClient` is the single boundary between agent code and any LLM
backend (Gemini today, Ollama in Phase 6, others later). The data
contracts `LLMRequest` and `LLMResponse` are immutable dataclasses
serialised across the contract — no provider-specific types leak
into agent code.

Token counts and latency are part of `LLMResponse` because every
agent invocation must be traced (`messages.tokens_*`, `messages.
latency_ms` per migration 032). The model identifier is also
returned to make traces self-describing.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True)
class LLMRequest:
    """Single completion request — frozen to keep the contract immutable."""

    prompt: str
    temperature: float
    max_tokens: int
    thinking_enabled: bool = False
    system_prompt: str | None = None


@dataclass(frozen=True)
class LLMResponse:
    """Single completion response with full traceability metadata."""

    content: str
    thinking_trace: str | None
    tokens_input: int
    tokens_output: int
    tokens_thinking: int
    latency_ms: int
    model_used: str


class LLMClient(ABC):
    """Abstract LLM client. Implementations are async-only."""

    @abstractmethod
    async def complete(self, request: LLMRequest) -> LLMResponse:
        """Run a single completion and return the canonical response."""
