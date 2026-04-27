"""Gemini implementation of `LLMClient`.

The model identifier is read from `Settings.gemini_model` — never
hardcoded. The API key is read from `Settings.gemini_api_key`; the
constructor refuses to instantiate without one (fails loud at
process start, per the zero-hardcoding doctrine docs/03 Niveau 3).

`thinking_enabled` is captured in the request contract so callers
can express the intent uniformly. The current
`google-generativeai` 0.8.x SDK does not yet expose the thinking
configuration on `generate_content_async`; once the SDK lands the
new parameter, this client will pipe `request.thinking_enabled`
through and surface the trace in `LLMResponse.thinking_trace`. For
now the trace is `None` and `tokens_thinking` is 0.
"""

from __future__ import annotations

import time
from typing import Any

import google.generativeai as genai

from app.config import Settings
from app.llm.base import LLMClient, LLMRequest, LLMResponse


class GeminiClient(LLMClient):
    """Async Gemini client."""

    def __init__(self, settings: Settings) -> None:
        if settings.gemini_api_key is None:
            raise ValueError(
                "GEMINI_API_KEY is required when LLM_PROVIDER='gemini'",
            )
        # The google-generativeai 0.8.x stubs do not re-export the
        # module-level helpers in `__all__`, so mypy needs the explicit
        # ignores. The runtime symbols are stable across the 0.8 line.
        genai.configure(api_key=settings.gemini_api_key)  # type: ignore[attr-defined]
        self._model_name: str = settings.gemini_model
        self._default_model: Any = genai.GenerativeModel(  # type: ignore[attr-defined]
            self._model_name,
        )

    async def complete(self, request: LLMRequest) -> LLMResponse:
        generation_config: dict[str, Any] = {
            "temperature": request.temperature,
            "max_output_tokens": request.max_tokens,
        }

        # System instruction is set at model construction time per the
        # google-generativeai SDK: when present, build a fresh model
        # with the instruction; otherwise reuse the cached default.
        if request.system_prompt is not None:
            model: Any = genai.GenerativeModel(  # type: ignore[attr-defined]
                self._model_name,
                system_instruction=request.system_prompt,
            )
        else:
            model = self._default_model

        start = time.perf_counter()
        response = await model.generate_content_async(
            request.prompt,
            generation_config=generation_config,
        )
        elapsed_ms = int((time.perf_counter() - start) * 1000)

        usage = response.usage_metadata
        return LLMResponse(
            content=str(response.text),
            thinking_trace=None,
            tokens_input=int(usage.prompt_token_count),
            tokens_output=int(usage.candidates_token_count),
            tokens_thinking=0,
            latency_ms=elapsed_ms,
            model_used=self._model_name,
        )
