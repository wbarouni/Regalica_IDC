"""FastAPI entry point for Regalica IDC chatbot-py service."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.pool import close_pool, get_pool
from app.llm.factory import create_llm_client
from app.logger import configure_logger, get_logger
from app.routes.chat import router as chat_router
from app.routes.health import router as health_router
from app.routes.upload import router as upload_router

configure_logger(settings.log_level)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(fastapi_app: FastAPI) -> AsyncIterator[None]:
    logger.info("regalica-chatbot-py starting", port=settings.port, env=settings.env)

    # LLM client: stateless, instantiated once per process. The factory
    # validates the provider and refuses to start with an incomplete
    # configuration (no fallback values, no silent degradation).
    fastapi_app.state.llm_client = create_llm_client(settings)

    # DB pool: pre-warm at startup when DATABASE_URL is set so the
    # process fails fast on a misconfigured DSN. The health probe path
    # tolerates a missing pool (database_url is optional in non-DB
    # modes such as a smoke test of the LLM stack alone).
    if settings.database_url is not None:
        fastapi_app.state.db_pool = await get_pool(settings)

    try:
        yield
    finally:
        await close_pool()
        logger.info("regalica-chatbot-py shutting down")


app = FastAPI(
    title="Regalica IDC — Chatbot Py",
    version="0.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.env != "production" else None,
    redoc_url=None,
)

# CORS allow-list driven by CHATBOT_CORS_ORIGIN (comma-separated). The
# frontend at VITE_CHATBOT_URL must be present in the list or the
# browser blocks fetch() against /chat/*. Empty value -> middleware
# not registered (same-origin callers still work; cross-origin
# rejected by the browser as expected).
_cors_origins = [
    origin.strip() for origin in settings.chatbot_cors_origin.split(",") if origin.strip()
]
if _cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=["*"],
    )

app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(chat_router, prefix="/chat", tags=["chat"])
app.include_router(upload_router, prefix="/upload", tags=["upload"])
