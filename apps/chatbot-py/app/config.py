"""Environment-driven configuration, validated by Pydantic Settings.

All LLM-related values (provider, model names, endpoint URLs) are REQUIRED
from the environment. No defaults are declared here — per CLAUDE.md §11
and the zero-hardcoding doctrine (docs/03 Niveau 3), a missing LLM config
env var must fail the process at startup with a Pydantic validation error
rather than silently fall back to a baked-in value. Canonical reference
values for a local dev setup live in .env.example.

Non-LLM knobs that are deployment-neutral (env name, port, log level)
keep their defaults since they are either FSM grammar (`env`), protocol
constants (`port` when running standalone), or log-verbosity choices
that do not change the system's logical behaviour.
"""

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralised runtime configuration loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    env: Literal["development", "test", "production"] = Field(
        default="development", alias="NODE_ENV"
    )
    # protocol port; deployment-neutral default per module docstring
    port: int = Field(
        default=8000,  # nosemgrep: D-006-magic-number-assignment
        alias="CHATBOT_PY_PORT",
    )
    log_level: Literal["debug", "info", "warning", "error", "critical"] = Field(
        default="info", alias="LOG_LEVEL"
    )

    database_url: str | None = Field(default=None, alias="DATABASE_URL")

    # LLM config — REQUIRED, no defaults. See module docstring.
    # The `Literal[...]` provider types are compile-time type constraints;
    # pydantic only accepts string literals inside typing.Literal, so those
    # values cannot be indirected through env/platform_config. Marked with
    # `nosemgrep: D-001-llm-model-literal` so Guard D skips the lines.
    llm_provider: Literal["gemini", "ollama"] = Field(  # nosemgrep: D-001-llm-model-literal
        alias="LLM_PROVIDER"
    )
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(alias="GEMINI_MODEL")
    # Thinking budget (token cap) when LLMRequest.thinking_enabled is True.
    # Owned by the operator via env so the cost / quality trade-off is not
    # baked into source — same doctrine as the model name.
    gemini_thinking_budget: int = Field(alias="GEMINI_THINKING_BUDGET")
    ollama_url: str = Field(alias="OLLAMA_URL")
    ollama_model: str = Field(alias="OLLAMA_MODEL")

    embedding_provider: Literal["gemini", "ollama"] = Field(  # nosemgrep: D-001-llm-model-literal
        alias="EMBEDDING_PROVIDER"
    )
    embedding_model: str = Field(alias="EMBEDDING_MODEL")

    # Phase 3 Regalica router target — the (agent_type, function_name)
    # pair the orchestrator looks up in prompt_bank to drive intent
    # detection. Phase 3-bis replaces the simple router with a full
    # planner pipeline (doc 10 §15-16); until then, the operator
    # picks the bearer via env so no agent key is baked into source.
    chatbot_router_agent_type: str = Field(alias="CHATBOT_ROUTER_AGENT_TYPE")
    chatbot_router_function_name: str = Field(alias="CHATBOT_ROUTER_FUNCTION_NAME")

    # T0 briefing prompt target loaded by /upload after the
    # deterministic agents have run. Same env-driven pattern as the
    # router target so no (agent_type, function_name) literal sits in
    # source (Guard D-004).
    chatbot_briefing_agent_type: str = Field(alias="CHATBOT_BRIEFING_AGENT_TYPE")
    chatbot_briefing_function_name: str = Field(alias="CHATBOT_BRIEFING_FUNCTION_NAME")

    # CORS allow-list for the chatbot HTTP boundary. Comma-separated list
    # of origins authorised to call /chat/*. Empty/unset disables
    # cross-origin entirely (same-origin callers still work).
    chatbot_cors_origin: str = Field(default="", alias="CHATBOT_CORS_ORIGIN")

    # Base URL of the REGFlow Node API used by chatbot-py for service-
    # to-service calls (engine fail-details, agent-step events, …).
    # The shared JWT_SECRET below is used to sign the Bearer token
    # that the API's engineAuthMiddleware verifies. Both REGFLOW_API_URL
    # and JWT_SECRET are deployment-wide values owned by the operator;
    # missing values fail the process at startup, never silently.
    api_url: str = Field(alias="REGFLOW_API_URL")
    jwt_secret: str = Field(alias="JWT_SECRET")
    # Lifetime of the engine-signed JWT minted per request. Short
    # enough that a leaked token expires before it can be replayed
    # across many calls, long enough to absorb container clock drift.
    # Default keeps existing deployments working without a new env
    # var; operators can shorten via CHATBOT_ENGINE_JWT_TTL_SECONDS.
    chatbot_engine_jwt_ttl_seconds: int = Field(
        default=300,  # nosemgrep: D-006-magic-number-assignment
        alias="CHATBOT_ENGINE_JWT_TTL_SECONDS",
    )


settings = Settings()
