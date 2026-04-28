import type { Pool, PoolClient } from 'pg';

/**
 * RLS-safe wrapper around `pg.Pool`.
 *
 * Acquires a client, opens a transaction, sets the per-request RLS GUCs
 * (`app.current_tenant_id`, optionally `app.current_user_id`), runs `fn`,
 * commits on success and rolls back on error.
 *
 * `SET LOCAL` is used so the values are scoped to the transaction and
 * cannot leak when the client is returned to the pool. Direct
 * `pool.query("SET …")` is silently broken under a pool because the next
 * call may grab a different client where the GUC is unset.
 */
export interface RlsContext {
  tenantId: string;
  userId?: string;
}

export async function withConnection<T>(
  pool: Pool,
  ctx: RlsContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.current_tenant_id = $1', [ctx.tenantId]);
    if (ctx.userId !== undefined) {
      await client.query('SET LOCAL app.current_user_id = $1', [ctx.userId]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback failure: the original error is what matters.
    }
    throw err;
  } finally {
    client.release();
  }
}
