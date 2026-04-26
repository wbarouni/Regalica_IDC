import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Pool, type PoolClient } from 'pg';

/**
 * Shared helpers for migration integration tests.
 *
 * Each describe block creates a throwaway PostgreSQL schema, applies the
 * requested range of migrations inside it via SET LOCAL search_path, and
 * drops the schema in afterAll. Requires a real Postgres via DATABASE_URL.
 *
 * The migrations create objects with unqualified names, so the PG
 * search_path resolves every reference to the test schema. Extensions
 * (pgcrypto, citext, vector, ...) are database-wide and are
 * idempotently installed on the first run; subsequent runs are no-ops.
 */

const MIGRATIONS_DIR = resolve(__dirname, '../../migrations');

export interface MigrationsTestContext {
  adminPool: Pool;
  testPool: Pool;
  schemaName: string;
}

export async function setupMigrationsSchema(
  lastMigrationId: number,
): Promise<MigrationsTestContext> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL is required for migration integration tests');
  }

  const schemaName = `mig_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

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
    // Matches both base migrations (NNN_slug.sql) and amendments
    // (NNN[a-z]_slug.sql). Sort() gives the correct apply order because
    // '007_base.sql' < '007a_amend.sql' < '008_next.sql' lexicographically.
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => /^\d{3}[a-z]?_.*\.sql$/.test(f))
      .sort();
    for (const file of files) {
      // The numeric prefix (first 3 digits) defines the tier; amendment
      // files share the tier of their base migration, so they are
      // included whenever lastMigrationId covers that tier.
      const id = Number.parseInt(file.slice(0, 3), 10);
      if (id > lastMigrationId) {
        break;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query(sql);
    }
  } finally {
    client.release();
  }

  return { adminPool, testPool, schemaName };
}

export async function teardownMigrationsSchema(ctx: MigrationsTestContext): Promise<void> {
  await ctx.testPool.end();
  await ctx.adminPool.query(`DROP SCHEMA IF EXISTS ${ctx.schemaName} CASCADE`);
  await ctx.adminPool.end();
}
