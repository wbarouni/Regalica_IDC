"""Structured JSON logging via structlog."""

import logging
from typing import Any

import structlog


def configure_logger(level: str = "info") -> None:
    """Configure root logging + structlog once at application startup."""
    logging.basicConfig(
        format="%(message)s",
        level=level.upper(),
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(logging.getLevelName(level.upper())),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str, **context: Any) -> structlog.stdlib.BoundLogger:
    """Return a structlog logger bound with service metadata."""
    # structlog's .bind() is typed as Any via its generic signature.
    return structlog.get_logger(name).bind(  # type: ignore[no-any-return]
        service="regalica-chatbot-py", **context
    )
