"""Ollama adapter (long-term target). Full implementation in Phase 6."""

from typing import Any

from app.llm.base import LLMResponse


class OllamaClient:
    """LLMClient adapter for Ollama HTTP API (e.g. Qwen 2.5 3B)."""

    def __init__(self, base_url: str, model: str = "qwen2.5:3b") -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def generate(
        self,
        system: str,
        user: str,
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int = 2000,
    ) -> LLMResponse:
        del system, user, json_schema, max_tokens
        raise NotImplementedError("OllamaClient.generate is implemented in Phase 6")
