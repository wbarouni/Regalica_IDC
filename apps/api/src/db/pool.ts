import { Pool, type PoolClient } from 'pg';
import { config } from '../config.js';

/**
 * Lazy singleton `pg.Pool` keyed on the process-wide DATABASE_URL.
 *
 * The pool is created on first access and reused for the lifetime of the
 * process. Callers should use `withConnection()` for short-lived work;
 * long-running transactions should acquire a client explicitly and release
 * it in a `finally` block.
 *
 * `config.databaseUrl` is optional at the schema level so the API can start
 * up during Phase 0 without a database. Any attempt to use the pool without
 * `DATABASE_URL` fails with a clear message rather than a confusing pg error.
 */

let cachedPool: Pool | null = null;

export function getPool(): Pool {
  if (cachedPool) {
    return cachedPool;
  }
  if (!config.databaseUrl) {
    throw new Error(
      '[db/pool] DATABASE_URL is required to use the database pool. ' +
        'Set it in your environment (.env, CI job, docker-compose).',
    );
  }
  cachedPool = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return cachedPool;
}

export async function withConnection<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
  }
}
