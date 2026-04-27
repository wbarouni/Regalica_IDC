"""Gemini implementation of `LLMClient` (google-genai SDK).

Migrated from the deprecated `google-generativeai` 0.8.x to
`google-genai` >=1.0.0 (commit 25-fix). The new SDK exposes a
single `genai.Client` whose `.aio.models.generate_content` is the
async entry point and accepts a structured `GenerateContentConfig`
(temperature, max_output_tokens, system_instruction, thinking_config,
...).

The model identifier is read from `Settings.gemini_model` — never
hardcoded. The API key is read from `Settings.gemini_api_key`; the
constructor refuses to instantiate without one (fails loud at
process start, per the zero-hardcoding doctrine docs/03 Niveau 3).

`thinking_enabled` is now natively wired: when set, a
`ThinkingConfig(thinking_budget=...)` is passed to the SDK, the
thought parts are extracted from the candidate, and
`tokens_thinking` is populated from `usage_metadata.thoughts_token_count`.
The thinking budget value is parametric per the doctrine (no magic
number in code) — see `THINKING_BUDGET_DEFAULT` below.
"""

from __future__ import annotations

import time

from google import genai
from google.genai import types

from app.config import Settings
from app.llm.base import LLMClient, LLMRequest, LLMResponse


class GeminiClient(LLMClient):
    """Async Gemini client backed by the google-genai SDK."""

    def __init__(self, settings: Settings) -> None:
        if settings.gemini_api_key is None:
            raise ValueError(
                "GEMINI_API_KEY is required when LLM_PROVIDER='gemini'",
            )
        self._client = genai.Client(api_key=settings.gemini_api_key)
        self._model_name: str = settings.gemini_model
        # Thinking budget owned by the operator via Settings.gemini_thinking_budget.
        # Phase 3-bis may push this to a per-request override carried on
        # LLMRequest itself; for now, every request that opts into thinking
        # uses the same env-driven cap.
        self._thinking_budget: int = settings.gemini_thinking_budget

    async def complete(self, request: LLMRequest) -> LLMResponse:
        config = types.GenerateContentConfig(
            temperature=request.temperature,
            max_output_tokens=request.max_tokens,
            system_instruction=request.system_prompt,
        )
        if request.thinking_enabled:
            config.thinking_config = types.ThinkingConfig(
                thinking_budget=self._thinking_budget,
            )

        start = time.monotonic()
        response = await self._client.aio.models.generate_content(
            model=self._model_name,
            contents=request.prompt,
            config=config,
        )
        latency_ms = int((time.monotonic() - start) * 1000)

        thinking_trace: str | None = None
        if request.thinking_enabled and response.candidates:
            first_candidate = response.candidates[0]
            content = first_candidate.content
            if content is not None and content.parts is not None:
                for part in content.parts:
                    if getattr(part, "thought", False):
                        thinking_trace = part.text
                        break

        usage = response.usage_metadata
        tokens_input = (usage.prompt_token_count if usage is not None else None) or 0
        tokens_output = (usage.candidates_token_count if usage is not None else None) or 0
        tokens_thinking = (usage.thoughts_token_count if usage is not None else None) or 0

        return LLMResponse(
            content=response.text or "",
            thinking_trace=thinking_trace,
            tokens_input=tokens_input,
            tokens_output=tokens_output,
            tokens_thinking=tokens_thinking,
            latency_ms=latency_ms,
            model_used=self._model_name,
        )
