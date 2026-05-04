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
import { configureRunEventBus } from './lib/runEventBus.js';
import { authMiddleware, tenantMiddleware } from './middleware/auth.js';
import { correlationIdMiddleware } from './middleware/correlationId.js';
import { errorHandler } from './middleware/error-handler.js';
import { conversationsRouter } from './routes/conversations.js';
import { engineRouter } from './routes/engine.js';
import { filingsRouter } from './routes/filings.js';
import { healthRouter } from './routes/health.js';
import { libraryRouter } from './routes/library.js';
import { notificationsRouter } from './routes/notifications.js';
import { promptsRouter } from './routes/prompts.js';
import { runsRouter } from './routes/runs.js';
import { uploadsRouter } from './routes/uploads.js';
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
  // CORS must allow the X-Correlation-Id custom header so a browser
  // client can either echo a server-generated id or seed its own.
  app.use(
    cors({
      origin: config.corsOrigin,
      credentials: true,
      exposedHeaders: ['X-Correlation-Id'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Correlation-Id'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));
  // Correlation-Id resolution must run AFTER pino-http so the per-
  // request child logger exists when we bind correlation_id to it,
  // but BEFORE any router so handlers can read res.locals.correlationId.
  app.use(correlationIdMiddleware);

  app.use('/health', healthRouter);

  if (pool) {
    // Configure the in-process SSE event bus from platform_config.
    // Fire-and-forget: failures are logged inside the function and
    // leave the bus on Node's default cap (10) — acceptable for the
    // first few ms of boot before any client subscribes.
    void configureRunEventBus(pool);
    const apiMountPath = '/api/tenants/:tenantId';
    app.use(apiMountPath, authMiddleware, tenantMiddleware);
    app.use(apiMountPath, workspaceRouter(pool));
    app.use(apiMountPath, notificationsRouter(pool));
    app.use(apiMountPath, libraryRouter(pool));
    app.use(apiMountPath, conversationsRouter(pool));
    app.use(apiMountPath, filingsRouter(pool));
    app.use(apiMountPath, promptsRouter(pool));
    app.use(apiMountPath, uploadsRouter(pool));
    app.use(apiMountPath, runsRouter(pool));
    // Engine routes use a separate auth chain (Bearer JWT signed
    // with regflow_engine claim — see middleware/engineAuth.ts).
    app.use('/api/engine', engineRouter(pool));
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
