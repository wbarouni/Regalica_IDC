import { Pool } from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';
import { config } from './config';
import { logger } from './logger';

// Lazy pg Pool — created on first use so tests can run without DATABASE_URL.
let _pool: Pool | undefined;

export function getPool(): Pool {
  if (_pool) {
    return _pool;
  }
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set — cannot create pg pool');
  }
  _pool = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  _pool.on('error', (err) => {
    logger.error({ err }, 'pg pool error');
  });
  return _pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as never);
  return res.rows;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = undefined;
  }
}
