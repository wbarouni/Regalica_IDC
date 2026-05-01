import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_CORS_ORIGIN: z.string(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  PG_POOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive(),
  PG_POOL_CONN_TIMEOUT_MS: z.coerce.number().int().positive(),
  CHATBOT_PY_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('[config] invalid environment variables:', parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.API_PORT,
  corsOrigin: env.API_CORS_ORIGIN,
  logLevel: env.LOG_LEVEL,
  databaseUrl: env.DATABASE_URL,
  jwt: {
    secret: env.JWT_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtl: env.JWT_REFRESH_TTL,
  },
  pool: {
    idleTimeoutMs: env.PG_POOL_IDLE_TIMEOUT_MS,
    connectionTimeoutMs: env.PG_POOL_CONN_TIMEOUT_MS,
  },
  chatbotPyUrl: env.CHATBOT_PY_URL,
} as const;

export type Config = typeof config;
