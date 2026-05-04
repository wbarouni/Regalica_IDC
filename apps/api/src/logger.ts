import pino from 'pino';
import { config } from './config';

// pino-pretty is a dev-only transport. In production we ship raw JSON
// to stdout so the platform's log collector (Loki / docker-compose
// logs) can parse structured fields without a worker thread spinning
// up to colorize lines no human reads.
const transport =
  process.env['NODE_ENV'] !== 'production'
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      }
    : undefined;

export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  base: { service: 'regalica-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(transport ? { transport } : {}),
});
