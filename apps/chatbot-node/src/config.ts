import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CHATBOT_NODE_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.string().optional(),
  CHATBOT_PY_URL: z.string().url().default('http://chatbot-py:8000'),
  API_CORS_ORIGIN: z.string().default('http://localhost:4200'),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('[config] invalid environment variables:', parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.CHATBOT_NODE_PORT,
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  chatbotPyUrl: env.CHATBOT_PY_URL,
  corsOrigin: env.API_CORS_ORIGIN,
} as const;

export type Config = typeof config;
