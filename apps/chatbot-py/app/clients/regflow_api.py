"""HTTP client for the REGFlow Node API engine surface.

The Node API exposes /api/engine/* routes gated by engineAuthMiddleware
(role='regflow_engine' claim). This module is the chatbot-py side of
that contract: it signs short-lived JWTs with the shared JWT_SECRET
on every call (no token caching — keeps the blast radius of a leak
to the request lifetime) and POSTs the canonical payloads.

Two surfaces are exposed:

* ``notify_agent_step``   — POST /api/engine/runs/<run>/agent-steps/<step>
                            Updates run_agent_steps + emits the
                            matching SSE frame via runEventBus so the
                            workspace ribbon animates in real time.

* ``persist_message``     — POST /api/engine/conversations/<id>/messages
                            Persists an assistant/system message
                            outside the standard /chat/message flow,
                            typically the T0 briefing produced by
                            /upload after the deterministic agents
                            succeed.

Both endpoints expect the JWT payload to carry ``role='regflow_engine'``
and ``tenant_id``; the persist_message body must repeat ``tenant_id``
to match the JWT claim (the API enforces equality with 403 on drift).

Failure modes raise ``RegflowApiError`` with the upstream HTTP status,
so callers can decide whether to abort or degrade. ``/upload`` treats
notify_agent_step failures as non-fatal (the briefing is more important
than the SSE animation) and persist_message failures as also non-fatal
(the briefing was already delivered through the synchronous /upload
response — the engine persistence is best-effort augmentation).
"""

from __future__ import annotations

import time
from typing import Any

import httpx
import jwt

from app.config import settings


class RegflowApiError(Exception):
    """Raised on a non-2xx response from the engine API."""

    def __init__(self, status_code: int, body: str, *, endpoint: str) -> None:
        super().__init__(f"engine api {endpoint} returned {status_code}: {body[:200]}")
        self.status_code = status_code
        self.body = body
        self.endpoint = endpoint


# JWT lifetime — short enough that a leaked token expires before it can
# be replayed across many requests, long enough to absorb clock drift
# between chatbot-py and api containers (Docker compose usually < 1s,
# but in production we may straddle bare-metal hosts).
_JWT_TTL_SECONDS = 300

_ENGINE_ROLE = "regflow_engine"


def _sign_engine_jwt(tenant_id: str) -> str:
    """Sign a short-lived HS256 token the API's engineAuthMiddleware accepts."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "role": _ENGINE_ROLE,
        "tenant_id": tenant_id,
        "iss": "chatbot-py",
        "iat": now,
        "exp": now + _JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def _engine_base_url() -> str:
    """Strip a trailing slash and append /api/engine."""
    return f"{settings.api_url.rstrip('/')}/api/engine"


class RegflowApiClient:
    """Thin async wrapper over httpx.AsyncClient for the engine surface."""

    def __init__(self, http_client: httpx.AsyncClient | None = None) -> None:
        # Allow injection for tests; production callers create a fresh
        # client per request lifecycle and close it via aclose().
        self._owns_client = http_client is None
        self._client: httpx.AsyncClient = http_client or httpx.AsyncClient(
            base_url=_engine_base_url(),
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=10.0, pool=5.0),
        )

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def notify_agent_step(
        self,
        *,
        run_id: str,
        step_id: str,
        tenant_id: str,
        new_status: str,
        started_at: str | None = None,
        completed_at: str | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        """POST /runs/<run>/agent-steps/<step> — update + SSE."""
        endpoint = f"/runs/{run_id}/agent-steps/{step_id}"
        body: dict[str, Any] = {"status": new_status}
        if started_at is not None:
            body["startedAt"] = started_at
        if completed_at is not None:
            body["completedAt"] = completed_at
        if error_message is not None:
            body["errorMessage"] = error_message
        return await self._post(endpoint, body, tenant_id)

    async def persist_message(
        self,
        *,
        conversation_id: str,
        tenant_id: str,
        content: str,
        role: str = "assistant",
        metadata: dict[str, Any] | None = None,
        produced_by_agent: str | None = None,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """POST /conversations/<id>/messages — persist a Regalica message."""
        endpoint = f"/conversations/{conversation_id}/messages"
        body: dict[str, Any] = {
            "tenant_id": tenant_id,
            "role": role,
            "content": content,
        }
        if metadata is not None:
            body["metadata"] = metadata
        if produced_by_agent is not None:
            body["produced_by_agent"] = produced_by_agent
        if run_id is not None:
            body["run_id"] = run_id
        return await self._post(endpoint, body, tenant_id)

    async def _post(
        self,
        endpoint: str,
        body: dict[str, Any],
        tenant_id: str,
    ) -> dict[str, Any]:
        token = _sign_engine_jwt(tenant_id)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        response = await self._client.post(endpoint, json=body, headers=headers)
        if response.status_code // 100 != 2:
            raise RegflowApiError(
                response.status_code,
                response.text,
                endpoint=endpoint,
            )
        parsed: Any = response.json()
        if not isinstance(parsed, dict):
            raise RegflowApiError(
                response.status_code,
                f"expected JSON object, got {type(parsed).__name__}",
                endpoint=endpoint,
            )
        return parsed
