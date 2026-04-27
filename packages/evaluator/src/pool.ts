/**
 * REGFlow — RDG Evaluator Postgres pool helpers.
 *
 * Thin wrapper around `pg.Pool`. The caller owns the pool lifecycle
 * (createPool then closePool); no global singleton lives in this package
 * so each consumer (API service, golden test, ad-hoc tooling) manages
 * its own connection state explicitly.
 */

import { Pool, type PoolClient } from 'pg';

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl });
}

export async function withConnection<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool(pool: Pool): Promise<void> {
  await pool.end();
}
