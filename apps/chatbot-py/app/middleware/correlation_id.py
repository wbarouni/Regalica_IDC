"""Correlation-Id propagation middleware (chatbot-py mirror of Node side).

Reads ``X-Correlation-Id`` from the incoming request. If absent or
malformed, generates a fresh UUID v4. The resolved value is:

  * stored on ``request.state.correlation_id`` for handlers and
    downstream code (``RegflowApiClient`` reuses it on /finalize);
  * echoed back via the ``X-Correlation-Id`` response header so a
    browser dev tool / curl can correlate logs;
  * bound to ``structlog.contextvars`` so every log emitted during the
    request lifetime inherits ``correlation_id`` automatically (Tranche
    0 observabilité socle: structured JSON logs, no Prometheus this
    tranche).

UUID v4 only — UUID v7 (variant 7, ordered timestamp prefix) leaks
server clock info and is rejected. Bytes come from ``uuid.uuid4()``
which is RFC 4122 v4.

Pure module: no DB, no business logic. Mounted ONCE at the top of the
FastAPI app in ``main.py``, before all routers.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Awaitable, Callable

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# Accept any RFC 4122 v1-v5 (covers v4 + tolerates legacy clients);
# v7 (ordered timestamp prefix) is rejected — same regex as the Node
# middleware in apps/api/src/middleware/correlationId.ts.
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

CORRELATION_ID_HEADER = "X-Correlation-Id"


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Inject a per-request correlation_id into request.state + logs."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        incoming = request.headers.get(CORRELATION_ID_HEADER)
        if isinstance(incoming, str) and _UUID_RE.match(incoming) is not None:
            correlation_id = incoming.lower()
        else:
            correlation_id = str(uuid.uuid4())

        # request.state is a free-form attribute bag — no Pydantic
        # validation, so we attach the id directly. Handlers read via
        # request.state.correlation_id.
        request.state.correlation_id = correlation_id

        # Bind to structlog contextvars so every structlog log emitted
        # during the request inherits {correlation_id: ...}. Cleared
        # in finally to avoid contextvar leakage between requests.
        structlog.contextvars.bind_contextvars(correlation_id=correlation_id)
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.unbind_contextvars("correlation_id")

        response.headers[CORRELATION_ID_HEADER] = correlation_id
        return response
