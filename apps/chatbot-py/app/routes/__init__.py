"""FastAPI route modules."""

from app.routes.chat import router as chat_router
from app.routes.health import router as health_router
from app.routes.persona import router as persona_router

__all__ = ["chat_router", "health_router", "persona_router"]
