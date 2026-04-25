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
    ollama_url: str = Field(alias="OLLAMA_URL")
    ollama_model: str = Field(alias="OLLAMA_MODEL")

    embedding_provider: Literal["gemini", "ollama"] = Field(  # nosemgrep: D-001-llm-model-literal
        alias="EMBEDDING_PROVIDER"
    )
    embedding_model: str = Field(alias="EMBEDDING_MODEL")


settings = Settings()
