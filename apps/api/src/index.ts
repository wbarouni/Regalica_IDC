import { createApp, createHttpServer } from './app';
import { config } from './config';
import { getPool } from './db/pool';
import { logger } from './logger';

// Inject the production pg pool so /api/tenants/* routes mount.
// When DATABASE_URL is unset, getPool() throws -- log and start
// the app in /health-only mode rather than crashing the process.
let pool: ReturnType<typeof getPool> | undefined;
try {
  pool = getPool();
} catch (err) {
  logger.warn({ err }, 'database pool unavailable; only /health is mounted');
}

const app = createApp(pool);
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
