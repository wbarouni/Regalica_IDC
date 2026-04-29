import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import pinoHttp from 'pino-http';
import type { Pool } from 'pg';
import { Server as SocketServer } from 'socket.io';

import { config } from './config.js';
import { logger } from './logger.js';
import { authMiddleware, tenantMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { conversationsRouter } from './routes/conversations.js';
import { filingsRouter } from './routes/filings.js';
import { healthRouter } from './routes/health.js';
import { libraryRouter } from './routes/library.js';
import { notificationsRouter } from './routes/notifications.js';
import { workspaceRouter } from './routes/workspace.js';

/**
 * Build the Express app.
 *
 * `pool` is optional so the legacy boot path (Phase 0..3) continues to
 * serve only `/health` when no DB is wired. Production and tests pass
 * an explicit `Pool`; this enables every `/api/tenants/:tenantId/*`
 * route via the four routers, all gated by authMiddleware +
 * tenantMiddleware.
 */
export function createApp(pool?: Pool): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  app.use('/health', healthRouter);

  if (pool) {
    const apiMountPath = '/api/tenants/:tenantId';
    app.use(apiMountPath, authMiddleware, tenantMiddleware);
    app.use(apiMountPath, workspaceRouter(pool));
    app.use(apiMountPath, notificationsRouter(pool));
    app.use(apiMountPath, libraryRouter(pool));
    app.use(apiMountPath, conversationsRouter(pool));
    app.use(apiMountPath, filingsRouter(pool));
  }

  app.use(errorHandler);

  return app;
}

export function createHttpServer(app: Express): { server: HttpServer; io: SocketServer } {
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: { origin: config.corsOrigin, credentials: true },
    transports: ['websocket', 'polling'],
  });

  return { server, io };
}
