import { createApp, createHttpServer } from './app';
import { config } from './config';
import { logger } from './logger';

const app = createApp();
const { server, io } = createHttpServer(app);

const shutdown = (signal: string): void => {
  logger.info({ signal }, 'shutdown signal received');
  io.close();
  server.close(() => {
    logger.info('http server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'regalica-api listening');
});
