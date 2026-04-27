"""LLM abstraction layer.

The package exposes a provider-agnostic `LLMClient` interface plus the
canonical `LLMRequest` / `LLMResponse` data contracts. A factory
selects the concrete implementation from `Settings.llm_provider`.
"""

from app.llm.base import LLMClient, LLMRequest, LLMResponse
from app.llm.factory import create_llm_client

__all__ = ["LLMClient", "LLMRequest", "LLMResponse", "create_llm_client"]
