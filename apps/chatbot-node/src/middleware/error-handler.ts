import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = (req as unknown as { log?: { error: (obj: unknown, msg: string) => void } }).log;
  log?.error({ err }, 'unhandled error');
  if (res.headersSent) {
    return;
  }
  res.status(500).json({ error: 'internal_server_error' });
};
