import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';

import { config } from '../config.js';
import { HTTP_FORBIDDEN, HTTP_SERVICE_UNAVAILABLE, HTTP_UNAUTHORIZED } from '../lib/http.js';

/**
 * engineAuthMiddleware — gate for service-to-service routes that
 * receive writes from the validation engine (chatbot-py).
 *
 * Contract:
 *   Authorization: Bearer <jwt>
 *   Payload claims:
 *     role: "regflow_engine"   (exact match)
 *     [optional] tenant_id, run_id, iss, exp, iat
 *
 * The token is signed with config.jwt.secret on the chatbot-py side
 * (PyJWT) using the same shared secret. Verification is HS256.
 *
 * Failure modes:
 *   503 SERVICE_AUTH_NOT_CONFIGURED — JWT_SECRET unset on the server
 *   401 MISSING_BEARER             — Authorization header absent or malformed
 *   401 INVALID_TOKEN              — jwt.verify throws (signature, exp, …)
 *   403 INSUFFICIENT_ROLE          — token valid but role !== regflow_engine
 *
 * The user-facing X-User-Id middleware (apps/api/src/middleware/auth.ts)
 * is intentionally NOT touched by this gate; engine routes opt into
 * engineAuth explicitly at mount time.
 */

const ENGINE_ROLE = 'regflow_engine';
const BEARER_PREFIX = 'Bearer ';

interface EnginePayload extends JwtPayload {
  role?: string;
  tenant_id?: string;
}

export function engineAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const secret = config.jwt.secret;
  if (secret === undefined || secret.length === 0) {
    res.status(HTTP_SERVICE_UNAVAILABLE).json({
      error: {
        code: 'SERVICE_AUTH_NOT_CONFIGURED',
        message: 'JWT_SECRET must be set to accept engine-signed requests',
      },
    });
    return;
  }
  const header = req.header('authorization');
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) {
    res.status(HTTP_UNAUTHORIZED).json({
      error: { code: 'MISSING_BEARER', message: 'Authorization: Bearer <jwt> required' },
    });
    return;
  }
  const token = header.slice(BEARER_PREFIX.length).trim();
  let payload: EnginePayload;
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'string') {
      res.status(HTTP_UNAUTHORIZED).json({
        error: { code: 'INVALID_TOKEN', message: 'JWT payload must be a JSON object' },
      });
      return;
    }
    payload = decoded as EnginePayload;
  } catch (err) {
    res.status(HTTP_UNAUTHORIZED).json({
      error: {
        code: 'INVALID_TOKEN',
        message: err instanceof Error ? err.message : 'JWT verification failed',
      },
    });
    return;
  }
  if (payload.role !== ENGINE_ROLE) {
    res.status(HTTP_FORBIDDEN).json({
      error: {
        code: 'INSUFFICIENT_ROLE',
        message: `role claim must be "${ENGINE_ROLE}"`,
      },
    });
    return;
  }
  res.locals['engineRole'] = payload.role;
  if (typeof payload.tenant_id === 'string') {
    res.locals['enginePayloadTenantId'] = payload.tenant_id;
  }
  next();
}
