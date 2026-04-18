import { createApp } from './app';
import { config } from './config';
import { closePool } from './db';
import { logger } from './logger';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'regalica-chatbot-node listening');
});

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'shutdown signal received');
  server.close(async () => {
    await closePool();
    logger.info('http server + pg pool closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
