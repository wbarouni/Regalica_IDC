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
 * `res.locals['userId']` is typed `string` everywhere downstream because
 * any path that did not pass through this middleware has already been
 * rejected with 401.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('x-user-id');
  if (!isUuid(header)) {
    res.status(401).json({
      error: {
        code: 'MISSING_USER_ID',
        message: 'X-User-Id header required (valid UUID)',
      },
    });
    return;
  }
  res.locals['userId'] = header;
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
