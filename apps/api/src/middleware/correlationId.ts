import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

/**
 * Correlation-ID propagation middleware.
 *
 * Reads `X-Correlation-Id` from the incoming request. If absent or
 * malformed, generates a fresh UUID v4. The resolved value is:
 *   - exposed on `res.locals['correlationId']` for handlers and
 *     downstream middleware to read (e.g. `runs.ts` persists it on
 *     `validation_runs.correlation_id`; `engine.ts` /finalize includes
 *     it in the SSE payload);
 *   - echoed back to the client via the `X-Correlation-Id` response
 *     header so a browser developer tool / curl can correlate the
 *     server log line with the request;
 *   - bound to `req.log` if pino-http attached a child logger so every
 *     log emitted by the request inherits the field automatically
 *     (Tranche 0 observability socle: structured logs JSON with
 *     correlation_id, no Prometheus this tranche).
 *
 * UUID v4 format only — UUID v7 / v1 with timestamps would leak
 * server-side ordering and are excluded by the regex below. Bytes
 * come from `crypto.randomUUID()` which is RFC 4122 v4.
 *
 * Pure module: no DB, no network, no business logic. Mounted ONCE
 * at the top of the express stack in `app.ts`, before all routers.
 */

// Accept both lowercase and uppercase hex digits in the request, but
// always store + echo the canonical lowercase form to the client.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const CORRELATION_ID_LOCAL = 'correlationId';

// Pino-http attaches `req.log` as a `pino.Logger` instance. We only
// touch the `child()` method so the structural shape below is enough
// without pulling pino types into this middleware.
interface LogChild {
  child?: (bindings: Record<string, unknown>) => unknown;
}
type RequestWithLog = Omit<Request, 'log'> & { log?: LogChild };

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_ID_HEADER);
  const correlationId =
    typeof incoming === 'string' && UUID_RE.test(incoming) ? incoming.toLowerCase() : randomUUID();

  res.locals[CORRELATION_ID_LOCAL] = correlationId;
  res.setHeader('X-Correlation-Id', correlationId);

  // Bind to the per-request pino child logger if pino-http is mounted.
  // Idempotent: if no logger is present we silently no-op.
  const reqWithLog = req as RequestWithLog;
  if (reqWithLog.log !== undefined && typeof reqWithLog.log.child === 'function') {
    const child = reqWithLog.log.child({ correlation_id: correlationId });
    // Replace the per-request logger so all subsequent `req.log.*`
    // calls carry the correlation_id field automatically.
    (reqWithLog as { log: unknown }).log = child;
  }

  next();
}
