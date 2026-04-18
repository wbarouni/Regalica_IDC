"""FastAPI entry point for Regalica IDC chatbot-py service."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.logger import configure_logger, get_logger
from app.routes.health import router as health_router

configure_logger(settings.log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    logger.info("regalica-chatbot-py starting", port=settings.port, env=settings.env)
    yield
    logger.info("regalica-chatbot-py shutting down")


app = FastAPI(
    title="Regalica IDC — Chatbot Py",
    version="0.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.env != "production" else None,
    redoc_url=None,
)

app.include_router(health_router, prefix="/health", tags=["health"])
