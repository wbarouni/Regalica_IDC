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
  options?: { sessionVars?: Record<string, string> },
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
    // Session-level GUCs read by seed migrations (038-042) via
    // current_setting(). SET (not SET LOCAL) so the values persist
    // for the whole client session, covering every migration applied
    // in the loop below. Backward-compatible: tests that pass no
    // options leave the GUCs unset.
    if (options?.sessionVars) {
      for (const [key, value] of Object.entries(options.sessionVars)) {
        await client.query(`SET ${key} = '${value}'`);
      }
    }
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
    // Mirror migration 036's grants on the test schema so that
    // SET LOCAL ROLE regflow_app in RLS test blocks can access tables
    // when 036 hasn't run yet. For tier >= 36, migration 036 owns the
    // grant matrix (including the §23.1/2/3 REVOKEs) — replicating the
    // blanket grant here would undo those REVOKEs and break test 036.
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

export async function teardownMigrationsSchema(ctx: MigrationsTestContext): Promise<void> {
  await ctx.testPool.end();
  await ctx.adminPool.query(`DROP SCHEMA IF EXISTS ${ctx.schemaName} CASCADE`);
  await ctx.adminPool.end();
}

/**
 * Awaits a promise expected to reject with a Postgres error carrying a
 * specific SQLSTATE. Locale-stable: PG error messages are translated
 * (en/fr/de/...), but the 5-character SQLSTATE code defined in
 * `errcodes.txt` is part of the wire protocol and identical across
 * locales. Use this in lieu of `.rejects.toThrow(/english phrase/)`
 * whenever the matched text is built by Postgres rather than by an
 * application-level RAISE EXCEPTION (those carry custom strings, are
 * locale-stable already, and remain matched on text).
 *
 * Usage:
 *   await expectSqlState(client.query(...), '23505'); // unique_violation
 *
 * SQLSTATE codes used in the suite (PG official appendix):
 *   23502 not_null_violation
 *   23503 foreign_key_violation
 *   23505 unique_violation
 *   23514 check_violation
 *   42501 insufficient_privilege  (RLS WITH CHECK / USING denial)
 */
export async function expectSqlState(query: Promise<unknown>, sqlstate: string): Promise<void> {
  let caught: unknown = null;
  try {
    await query;
  } catch (err) {
    caught = err;
  }
  if (caught === null) {
    throw new Error(`Expected query to reject with SQLSTATE ${sqlstate}, but it resolved`);
  }
  const code = (caught as { code?: unknown }).code;
  if (code !== sqlstate) {
    throw new Error(
      `Expected SQLSTATE ${sqlstate}, got ${typeof code === 'string' ? code : 'undefined'}: ${
        (caught as { message?: unknown }).message ?? caught
      }`,
    );
  }
}
