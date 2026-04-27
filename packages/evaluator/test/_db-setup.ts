/**
 * Test-only database harness for @regflow/evaluator integration tests.
 *
 * Mirrors the pattern used by apps/api/tests/migrations/_setup.ts:
 *   - require DATABASE_URL (caller skips the suite when absent)
 *   - create a throw-away schema
 *   - apply migrations 001-NNN read from apps/api/migrations
 *   - drop the schema in teardown
 *
 * The migrations directory is the single source of truth for the SQL
 * schema; this harness reads the canonical .sql files rather than
 * duplicating any DDL into the package.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Pool, type PoolClient } from 'pg';

const MIGRATIONS_DIR = resolve(__dirname, '../../../apps/api/migrations');

export interface EvaluatorTestDb {
  adminPool: Pool;
  testPool: Pool;
  schemaName: string;
}

export async function setupEvaluatorTestSchema(
  lastMigrationId: number,
  options?: { sessionVars?: Record<string, string> },
): Promise<EvaluatorTestDb> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required for evaluator integration tests');
  }

  const schemaName = `evl_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  const adminPool = new Pool({ connectionString: url });
  await adminPool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT FROM pg_roles WHERE rolname = 'regflow_app'
      ) THEN
        CREATE ROLE regflow_app LOGIN;
      END IF;
    END $$;
  `);
  await adminPool.query(`CREATE SCHEMA ${schemaName}`);

  const testPool = new Pool({ connectionString: url });
  testPool.on('connect', (client: PoolClient) => {
    void client.query(`SET search_path TO ${schemaName}, public`);
  });

  const client = await testPool.connect();
  try {
    await client.query(`SET search_path TO ${schemaName}, public`);
    if (options?.sessionVars) {
      for (const [key, value] of Object.entries(options.sessionVars)) {
        await client.query(`SET ${key} = '${value}'`);
      }
    }
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => /^\d{3}[a-z]?_.*\.sql$/.test(f))
      .sort();
    for (const file of files) {
      const id = Number.parseInt(file.slice(0, 3), 10);
      if (id > lastMigrationId) break;
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query(sql);
    }
    if (lastMigrationId < 36) {
      await client.query(`GRANT USAGE ON SCHEMA ${schemaName} TO regflow_app`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schemaName} TO regflow_app`,
      );
      await client.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schemaName} TO regflow_app`,
      );
    }
  } finally {
    client.release();
  }

  return { adminPool, testPool, schemaName };
}

export async function teardownEvaluatorTestSchema(ctx: EvaluatorTestDb): Promise<void> {
  await ctx.testPool.end();
  await ctx.adminPool.query(`DROP SCHEMA IF EXISTS ${ctx.schemaName} CASCADE`);
  await ctx.adminPool.end();
}
