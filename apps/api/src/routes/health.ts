import { Router, type IRouter } from 'express';

export const healthRouter: IRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'regalica-api',
    version: process.env.npm_package_version ?? '0.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
