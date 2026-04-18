"""Environment-driven configuration, validated by Pydantic Settings."""

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
    port: int = Field(default=8000, alias="CHATBOT_PY_PORT")
    log_level: Literal["debug", "info", "warning", "error", "critical"] = Field(
        default="info", alias="LOG_LEVEL"
    )

    database_url: str | None = Field(default=None, alias="DATABASE_URL")

    llm_provider: Literal["gemini", "ollama"] = Field(default="gemini", alias="LLM_PROVIDER")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    ollama_url: str = Field(default="http://ollama:11434", alias="OLLAMA_URL")
    ollama_model: str = Field(default="qwen2.5:3b", alias="OLLAMA_MODEL")

    embedding_provider: Literal["gemini", "ollama"] = Field(
        default="gemini", alias="EMBEDDING_PROVIDER"
    )
    embedding_model: str = Field(default="text-embedding-004", alias="EMBEDDING_MODEL")


settings = Settings()
