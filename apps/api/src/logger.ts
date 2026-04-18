import pino from 'pino';
import { config } from './config';

const transport =
  config.isProd || config.isTest
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      };

export const logger = pino({
  level: config.isTest ? 'silent' : config.logLevel,
  base: { service: 'regalica-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(transport ? { transport } : {}),
});
