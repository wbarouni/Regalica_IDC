"""Unit tests for the LLM factory and contracts. No network calls."""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest
from app.config import Settings
from app.llm.base import LLMClient, LLMRequest, LLMResponse
from app.llm.factory import create_llm_client
from app.llm.gemini import GeminiClient


def _make_settings(**overrides: str) -> Settings:
    """Build a `Settings` instance honouring the conftest defaults plus overrides."""
    with patch.dict(os.environ, overrides):
        return Settings()


def test_factory_returns_gemini_client_when_provider_is_gemini() -> None:
    settings = _make_settings(LLM_PROVIDER="gemini", GEMINI_API_KEY="test-key")
    client = create_llm_client(settings)
    assert isinstance(client, GeminiClient)
    assert isinstance(client, LLMClient)


def test_factory_raises_not_implemented_for_ollama() -> None:
    settings = _make_settings(LLM_PROVIDER="ollama")
    with pytest.raises(NotImplementedError):
        create_llm_client(settings)


def test_gemini_client_refuses_init_without_api_key() -> None:
    settings = _make_settings(LLM_PROVIDER="gemini", GEMINI_API_KEY="")
    # An empty string env var resolves to None via pydantic-settings'
    # alias coercion only when defaulted; here the field stays as the
    # empty string. Confirm our explicit check fires when api key is
    # actually unset (None).
    settings_no_key = Settings.model_construct(
        env=settings.env,
        port=settings.port,
        log_level=settings.log_level,
        database_url=settings.database_url,
        llm_provider="gemini",
        gemini_api_key=None,
        gemini_model=settings.gemini_model,
        gemini_thinking_budget=settings.gemini_thinking_budget,
        ollama_url=settings.ollama_url,
        ollama_model=settings.ollama_model,
        embedding_provider=settings.embedding_provider,
        embedding_model=settings.embedding_model,
    )
    with pytest.raises(ValueError, match="GEMINI_API_KEY"):
        GeminiClient(settings_no_key)


def test_llm_request_has_required_fields_and_defaults() -> None:
    request = LLMRequest(prompt="hi", temperature=0.3, max_tokens=100)
    assert request.prompt == "hi"
    assert request.temperature == 0.3
    assert request.max_tokens == 100
    assert request.thinking_enabled is False
    assert request.system_prompt is None


def test_llm_request_accepts_thinking_and_system_prompt() -> None:
    request = LLMRequest(
        prompt="explain",
        temperature=0.7,
        max_tokens=2048,
        thinking_enabled=True,
        system_prompt="You are Regalica.",
    )
    assert request.thinking_enabled is True
    assert request.system_prompt == "You are Regalica."


def test_llm_request_is_frozen() -> None:
    request = LLMRequest(prompt="hi", temperature=0.3, max_tokens=100)
    with pytest.raises((AttributeError, Exception)):
        request.prompt = "hello"  # type: ignore[misc]


def test_llm_response_has_all_fields() -> None:
    response = LLMResponse(
        content="hello",
        thinking_trace=None,
        tokens_input=10,
        tokens_output=5,
        tokens_thinking=0,
        latency_ms=42,
        model_used="model-from-settings",
    )
    assert response.content == "hello"
    assert response.thinking_trace is None
    assert response.tokens_input == 10
    assert response.tokens_output == 5
    assert response.tokens_thinking == 0
    assert response.latency_ms == 42
    assert response.model_used == "model-from-settings"


def test_llm_response_is_frozen() -> None:
    response = LLMResponse(
        content="hi",
        thinking_trace=None,
        tokens_input=1,
        tokens_output=1,
        tokens_thinking=0,
        latency_ms=1,
        model_used="m",
    )
    with pytest.raises((AttributeError, Exception)):
        response.content = "hello"  # type: ignore[misc]
