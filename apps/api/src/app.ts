import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import type { Server as HttpServer } from 'http';
import pinoHttp from 'pino-http';
import { Server as SocketServer } from 'socket.io';

import { config } from './config';
import { logger } from './logger';
import { errorHandler } from './middleware/error-handler';
import { healthRouter } from './routes/health';
import { evaluationRouter } from './routes/evaluation';
import { createUploadsRouter } from './routes/uploads';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  app.use('/health', healthRouter);
  app.use('/api/evaluation', evaluationRouter);

  app.use(errorHandler);

  return app;
}

export function createHttpServer(app: Express): { server: HttpServer; io: SocketServer } {
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: { origin: config.corsOrigin, credentials: true },
    transports: ['websocket', 'polling'],
  });

  // Mount uploads router after io is available
  app.use('/api/uploads', createUploadsRouter(io));

  return { server, io };
}
