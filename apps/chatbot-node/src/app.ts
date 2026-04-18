import cors from 'cors';
import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { config } from './config';
import { logger } from './logger';
import { errorHandler } from './middleware/error-handler';
import { chatRouter } from './routes/chat';
import { healthRouter } from './routes/health';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  app.use('/health', healthRouter);
  app.use('/chat', chatRouter);

  app.use(errorHandler);

  return app;
}
