import type { NextFunction, Request, Response } from 'express';

/**
 * Strict UUID v1-v8 validator.
 *
 * Express's typed query/header values are `string | undefined`. We validate
 * shape inline to avoid introducing a new dependency for a 1-line regex.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Reads the calling user id from `X-User-Id` (UUID).
 *
 * Phase 4 minimal: the dev shell sends the UUID directly. Phase 5 will
 * replace the body of this middleware with JWT decode + signature
 * verification while keeping the same `res.locals['userId']` contract.
 *
 * SSE fallback: `new EventSource(...)` cannot set custom HTTP headers
 * (WHATWG spec — the only options are `withCredentials` and the
 * implicit `Last-Event-ID`). To keep one auth contract across the
 * whole `/api/tenants/:tenantId/*` mount including the SSE
 * `/runs/:runId/stream` endpoint, we accept a `?userId=<uuid>` query
 * param when (and only when) the header is absent. The header still
 * wins when both are present; the query path is the SSE-only escape
 * hatch.
 *
 * `res.locals['userId']` is typed `string` everywhere downstream
 * because any path that did not pass through this middleware has
 * already been rejected with 401.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('x-user-id');
  const fallback = req.query['userId'];
  const candidate = isUuid(header) ? header : isUuid(fallback) ? fallback : null;
  if (candidate === null) {
    res.status(401).json({
      error: {
        code: 'MISSING_USER_ID',
        message: 'X-User-Id header (or ?userId= query for SSE) required (valid UUID)',
      },
    });
    return;
  }
  res.locals['userId'] = candidate;
  next();
}

/**
 * Validates the `:tenantId` path parameter as a UUID.
 *
 * Mounted before route-level middlewares so an invalid tenant id is
 * rejected with 400 before any DB query runs.
 */
export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.params['tenantId'];
  if (!isUuid(tenantId)) {
    res.status(400).json({
      error: {
        code: 'INVALID_TENANT_ID',
        message: 'tenantId must be a valid UUID',
      },
    });
    return;
  }
  next();
}
