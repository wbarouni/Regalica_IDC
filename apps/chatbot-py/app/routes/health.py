"""Health-check endpoint."""

import time
from datetime import UTC, datetime

from fastapi import APIRouter

_START_TIME = time.monotonic()

router = APIRouter()


@router.get("/")
async def health() -> dict[str, str | float]:
    return {
        "status": "ok",
        "service": "regalica-chatbot-py",
        "version": "0.0.0",
        "uptime": time.monotonic() - _START_TIME,
        "timestamp": datetime.now(UTC).isoformat(),
    }
