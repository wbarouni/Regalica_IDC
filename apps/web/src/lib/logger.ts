/**
 * Structured logger — Pino-compatible API.
 * Server-side only (never import in client components).
 * Replace the underlying implementation with Pino when installed:
 *   import pino from 'pino'; export const logger = pino({ level: 'info' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogRecord {
  level: LogLevel;
  msg: string;
  time: string;
  correlationId?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
  const record: LogRecord = {
    level,
    msg,
    time: new Date().toISOString(),
    ...fields,
  };
  // eslint-disable-next-line no-console
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  fn(JSON.stringify(record));
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info:  (msg: string, fields?: Record<string, unknown>) => write('info',  msg, fields),
  warn:  (msg: string, fields?: Record<string, unknown>) => write('warn',  msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
  child: (bindings: Record<string, unknown>) => ({
    debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, { ...bindings, ...fields }),
    info:  (msg: string, fields?: Record<string, unknown>) => write('info',  msg, { ...bindings, ...fields }),
    warn:  (msg: string, fields?: Record<string, unknown>) => write('warn',  msg, { ...bindings, ...fields }),
    error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, { ...bindings, ...fields }),
  }),
};
