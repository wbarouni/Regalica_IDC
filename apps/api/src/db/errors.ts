import type { Response } from 'express';

import { logger } from '../logger.js';

/**
 * Postgres error code narrowing.
 *
 * The pg driver throws plain `Error` objects with a `code` property
 * (5-character SQLSTATE). This helper performs strict structural
 * narrowing without resorting to `any`.
 */
function isDbError(e: unknown): e is { code: string; message: string } {
  if (typeof e !== 'object' || e === null) {
    return false;
  }
  const candidate = e as Record<string, unknown>;
  return typeof candidate['code'] === 'string' && typeof candidate['message'] === 'string';
}

/**
 * Translate a thrown error from a route handler into a JSON response.
 *
 * `42P01` (undefined_table) and `42703` (undefined_column) are surfaced as
 * `501 NOT_IMPLEMENTED` so the frontend can distinguish "schema gap" from
 * "internal failure". Everything else maps to `500 INTERNAL`.
 */
export function handleDbError(err: unknown, res: Response): void {
  logger.error({ err }, 'route handler failed');
  if (process.env['NODE_ENV'] === 'test') {
    // Surface the actual error in the test log so silent pino sinks
    // don't hide the diagnostic when debugging route integration tests.
    console.error('[handleDbError]', err);
  }
  if (isDbError(err)) {
    if (err.code === '42P01') {
      res.status(501).json({
        error: {
          code: 'TABLE_NOT_IMPLEMENTED',
          message: 'Required table does not exist yet',
        },
      });
      return;
    }
    if (err.code === '42703') {
      res.status(501).json({
        error: {
          code: 'COLUMN_NOT_FOUND',
          message: 'Schema mismatch — check migrations',
        },
      });
      return;
    }
  }
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
}
