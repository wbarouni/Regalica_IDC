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

import asyncio
import time
from typing import Any, TypedDict

import httpx
import jwt

from app.config import settings
from app.exceptions import EvaluationError, EvaluationTimeoutError


async def _sleep_seconds(seconds: float) -> None:
    """Indirection so tests can monkey-patch the backoff sleep without
    introducing real wall-clock waits."""
    await asyncio.sleep(seconds)


class RegflowApiError(Exception):
    """Raised on a non-2xx response from the engine API."""

    def __init__(self, status_code: int, body: str, *, endpoint: str) -> None:
        super().__init__(f"engine api {endpoint} returned {status_code}: {body[:200]}")
        self.status_code = status_code
        self.body = body
        self.endpoint = endpoint


# ---------------------------------------------------------------------------
# /evaluate response envelope (mirrors the C14 EngineEvaluateResponse).
#
# `pass` is a Python reserved word so the totals dict aliases it as
# `pass_`. The conversion happens in evaluate_run() below.
# Decimal columns (lhs / rhs / gap) arrive as strings to preserve the
# 38-digit precision contract end-to-end (CLAUDE.md §2). gap_relative
# arrives as a number — ratios fit safely in JS / Python doubles.
# ---------------------------------------------------------------------------


class EvaluateRunTotals(TypedDict):
    pass_: int
    fail_severe: int
    fail_rounding: int
    skipped_missing_annexe: int
    skipped_missing_rubrique: int
    skipped_missing_colonne: int
    skipped_missing_data: int
    skipped_conditional: int
    skipped_unsupported_op: int
    skipped_literal_text: int
    rules_applicable_total: int


class MappedVerdict(TypedDict):
    ax_term: str
    num_regle: int
    status: str
    severity: str | None
    lhs: str | None
    rhs: str | None
    gap: str | None
    gap_relative: float | None


class EvaluateRunResult(TypedDict):
    run_id: str
    arrete_date: str
    evaluated_at: str
    duration_ms: int
    verdicts: list[MappedVerdict]
    totals: EvaluateRunTotals


def _sign_engine_jwt(tenant_id: str) -> str:
    """Sign a short-lived HS256 token the API's engineAuthMiddleware accepts.

    The role claim string comes from settings.regflow_engine_role_claim
    (env REGFLOW_ENGINE_ROLE_CLAIM) — the Node API reads the same env
    var into config.engine.roleClaim and compares verbatim. Both apps
    MUST agree on the exact same value.

    The TTL comes from settings.chatbot_engine_jwt_ttl_seconds — operator-
    controlled via CHATBOT_ENGINE_JWT_TTL_SECONDS so the cost / risk
    trade-off is not baked into source (Guard D-006 doctrine).
    """
    now = int(time.time())
    payload: dict[str, Any] = {
        "role": settings.regflow_engine_role_claim,
        "tenant_id": tenant_id,
        "iss": "chatbot-py",
        "iat": now,
        "exp": now + settings.chatbot_engine_jwt_ttl_seconds,
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
        correlation_id: str | None = None,
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
        return await self._post(endpoint, body, tenant_id, correlation_id=correlation_id)

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
        correlation_id: str | None = None,
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
        return await self._post(endpoint, body, tenant_id, correlation_id=correlation_id)

    def _engine_auth_headers(
        self,
        tenant_id: str,
        correlation_id: str | None = None,
    ) -> dict[str, str]:
        """Build the engine-JWT auth headers for a given tenant.

        Extracted from `_post` so `evaluate_run` can reuse the same
        header construction without duplicating the JWT signing logic.
        Caller-controlled tenant_id flows into the JWT `tenant_id`
        claim that the API's engineAuthMiddleware validates.

        When ``correlation_id`` is supplied, propagate it via
        ``X-Correlation-Id`` so the Node API logs and the SSE payloads
        carry the same UUID as the chatbot-py logs of this request.
        """
        token = _sign_engine_jwt(tenant_id)
        headers: dict[str, str] = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if correlation_id is not None:
            headers["X-Correlation-Id"] = correlation_id
        return headers

    async def _post(
        self,
        endpoint: str,
        body: dict[str, Any],
        tenant_id: str,
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        headers = self._engine_auth_headers(tenant_id, correlation_id=correlation_id)
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

    async def evaluate_run(
        self,
        run_id: str,
        tenant_id: str,
        arrete_date: str,
        timeout_seconds: float = 30.0,
        correlation_id: str | None = None,
    ) -> EvaluateRunResult:
        """POST /api/engine/runs/<run>/evaluate — drive the RDG engine.

        The C14 route reads the XMLs from xml_uploads in DB by run_id +
        tenant_id; the caller does NOT pass any XML payload here.
        Only `arrete_date` (ISO YYYY-MM-DD) is sent in the body so the
        engine can pick the correct rule version via loadRules().

        Args:
            run_id: validation_runs.id whose attached uploads will be
                evaluated.
            tenant_id: tenant the run belongs to. Required to sign the
                engine JWT (the API enforces tenant_id claim equality
                with the row's tenant_id).
            arrete_date: ISO YYYY-MM-DD date used both as the rule
                applicability cut-off (loadRules) and as a passthrough
                in the response.
            timeout_seconds: per-request timeout. Defaults to 30s
                (engine p95 < 3s on a standard XML batch; 30s covers
                the heavy historical batches without blocking the
                chat path).

        Returns:
            EvaluateRunResult — verdicts already mapped to the REGFlow
            BLOQUANT/MAJEUR/MINEUR taxonomy, totals with the 11 keys
            of EvaluationTotals (pass aliased as pass_).

        Raises:
            EvaluationTimeoutError: the route did not respond within
                `timeout_seconds`.
            EvaluationError: the route returned a non-2xx response;
                the original status_code is preserved on the exception.
        """
        endpoint = f"/runs/{run_id}/evaluate"
        payload = {"arrete_date": arrete_date}
        headers = self._engine_auth_headers(tenant_id, correlation_id=correlation_id)

        try:
            response = await self._client.post(
                endpoint,
                json=payload,
                headers=headers,
                timeout=httpx.Timeout(timeout_seconds),
            )
            response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise EvaluationTimeoutError(
                run_id=run_id,
                timeout_seconds=timeout_seconds,
            ) from exc
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            try:
                error_body = exc.response.json()
                message = error_body.get("error", {}).get("message", str(exc))
            except (ValueError, AttributeError):
                message = str(exc)
            raise EvaluationError(
                message=f"evaluate_run HTTP {status_code} pour run {run_id}: {message}",
                status_code=status_code,
            ) from exc

        body = response.json()
        data = body["data"]
        raw_totals = data["totals"]

        totals: EvaluateRunTotals = {
            "pass_": raw_totals["pass"],
            "fail_severe": raw_totals["fail_severe"],
            "fail_rounding": raw_totals["fail_rounding"],
            "skipped_missing_annexe": raw_totals["skipped_missing_annexe"],
            "skipped_missing_rubrique": raw_totals["skipped_missing_rubrique"],
            "skipped_missing_colonne": raw_totals["skipped_missing_colonne"],
            "skipped_missing_data": raw_totals["skipped_missing_data"],
            "skipped_conditional": raw_totals["skipped_conditional"],
            "skipped_unsupported_op": raw_totals["skipped_unsupported_op"],
            "skipped_literal_text": raw_totals["skipped_literal_text"],
            "rules_applicable_total": raw_totals["rules_applicable_total"],
        }

        return EvaluateRunResult(
            run_id=str(data["run_id"]),
            arrete_date=str(data["arrete_date"]),
            evaluated_at=str(data["evaluated_at"]),
            duration_ms=int(data["duration_ms"]),
            verdicts=list(data["verdicts"]),
            totals=totals,
        )

    async def finalize_run(
        self,
        *,
        run_id: str,
        tenant_id: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
        retry_max: int = 3,
        retry_backoff_seconds: tuple[float, ...] = (1.0, 2.0, 4.0),
    ) -> dict[str, Any]:
        """POST /api/engine/runs/<run>/finalize — single-writer terminal write.

        Tranche 0 contract:
          * Idempotente côté Node : retries réseau avec MÊME
            correlation_id résolvent en 200 no-op (pas de double SSE).
          * 4xx (400/401/403/404/422/409) → propagés sans retry — le
            retry sur erreur protocolaire ne ferait que masquer un bug
            de payload côté caller.
          * Réseau / 5xx → retry exponentiel jusqu'à `retry_max`
            tentatives ; backoffs lus depuis platform_config keys
            ``t1_finalize_retry_max`` / ``t1_finalize_retry_backoff_seconds``
            (le caller les charge ; ce client n'a pas la connexion DB).

        Args:
            run_id: validation_runs.id à finaliser.
            tenant_id: tenant pour le JWT engine.
            payload: dict matching the Node zod ``finalizeBodySchema``
                (status, totals, fail_items, duration_ms, step1/2/3
                statuses + durations, error_code, synthesis_artifact).
            correlation_id: propagé en header X-Correlation-Id sur
                CHAQUE tentative — la dédup côté Node repose dessus.
            retry_max: nombre maximal de tentatives (≥ 1).
            retry_backoff_seconds: durées de backoff entre tentatives.
                len() doit être ≥ retry_max - 1 ; valeurs en secondes.

        Returns:
            Le body JSON de la réponse Node (data + meta), incluant
            ``data.idempotent: true`` si le serveur a no-op'é.

        Raises:
            RegflowApiError: 4xx (jamais retry) ou échec après tous
                les retries 5xx / réseau.
        """
        endpoint = f"/runs/{run_id}/finalize"
        headers = self._engine_auth_headers(tenant_id, correlation_id=correlation_id)

        attempts = max(1, retry_max)
        last_exc: Exception | None = None
        for attempt_index in range(attempts):
            try:
                response = await self._client.post(endpoint, json=payload, headers=headers)
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt_index < attempts - 1:
                    delay = (
                        retry_backoff_seconds[attempt_index]
                        if attempt_index < len(retry_backoff_seconds)
                        else retry_backoff_seconds[-1]
                    )
                    await _sleep_seconds(delay)
                    continue
                raise RegflowApiError(
                    0,
                    str(exc),
                    endpoint=endpoint,
                ) from exc

            status_code = response.status_code
            if status_code // 100 == 2:
                parsed: Any = response.json()
                if not isinstance(parsed, dict):
                    raise RegflowApiError(
                        status_code,
                        f"expected JSON object, got {type(parsed).__name__}",
                        endpoint=endpoint,
                    )
                return parsed

            # Client errors (4xx) bubble immediately. Retrying a 422
            # zod failure or a 409 conflict makes no sense — the caller
            # has a contract bug to fix.
            if 400 <= status_code < 500:
                raise RegflowApiError(
                    status_code,
                    response.text,
                    endpoint=endpoint,
                )

            # 5xx → retry with backoff.
            last_exc = RegflowApiError(status_code, response.text, endpoint=endpoint)
            if attempt_index < attempts - 1:
                delay = (
                    retry_backoff_seconds[attempt_index]
                    if attempt_index < len(retry_backoff_seconds)
                    else retry_backoff_seconds[-1]
                )
                await _sleep_seconds(delay)
                continue
            raise last_exc

        # Unreachable — the loop either returns on 2xx or raises on 4xx /
        # post-final 5xx. mypy needs the explicit raise to satisfy the
        # return-statement check.
        raise RegflowApiError(
            0,
            "finalize_run exhausted retries without a definitive response",
            endpoint=endpoint,
        )
