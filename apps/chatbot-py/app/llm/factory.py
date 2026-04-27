"""LLM client factory.

Selects the concrete `LLMClient` implementation from
`Settings.llm_provider`. The provider list is closed by the
`Literal` type in `Settings`; the factory returns the matching
client or raises `NotImplementedError` for providers whose
implementation has not yet landed.
"""

from __future__ import annotations

from app.config import Settings
from app.llm.base import LLMClient
from app.llm.gemini import GeminiClient


def create_llm_client(settings: Settings) -> LLMClient:
    """Return a fully configured `LLMClient` for the given settings."""
    if settings.llm_provider == "gemini":
        return GeminiClient(settings)
    # Ollama lands in Phase 6 (local fallback for offline / air-gapped
    # deployments). The Pydantic Literal narrows llm_provider to
    # 'gemini' | 'ollama', so this branch only fires for 'ollama'.
    raise NotImplementedError(
        f"LLM provider '{settings.llm_provider}' not yet implemented (Phase 6)",
    )
