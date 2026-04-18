"""Gemini adapter (MVP). Full implementation in Phase 4."""

from typing import Any

from app.llm.base import LLMResponse


class GeminiClient:
    """LLMClient adapter for Google Gemini via ``google-generativeai``."""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self.api_key = api_key
        self.model = model
        # Phase 4: wire up google.generativeai.configure(...) + GenerativeModel

    async def generate(
        self,
        system: str,
        user: str,
        *,
        json_schema: dict[str, Any] | None = None,
        max_tokens: int = 2000,
    ) -> LLMResponse:
        del system, user, json_schema, max_tokens
        raise NotImplementedError("GeminiClient.generate is implemented in Phase 4")
