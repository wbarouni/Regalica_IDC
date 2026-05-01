import type { ErrorRequestHandler } from 'express';
import { HTTP_INTERNAL_SERVER_ERROR } from '../lib/http.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = (req as unknown as { log?: { error: (obj: unknown, msg: string) => void } }).log;
  log?.error({ err }, 'unhandled error');
  if (res.headersSent) {
    return;
  }
  res.status(HTTP_INTERNAL_SERVER_ERROR).json({ error: 'internal_server_error' });
};
