import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const MIGRATIONS_DIR = resolve(__dirname, '../../migrations');

/**
 * Migration 038 (seed_annexes) reads three session GUCs via current_setting()
 * and references tenants(id) + users(id) at INSERT time. The fixture tenant
 * and user must therefore exist BEFORE migration 038 runs. We split the
 * harness in two phases: (1) apply migrations 001..037 normally via
 * setupMigrationsSchema, (2) seed fixture tenant + user, then apply
 * migration 038 manually with the GUCs set.
 */
describeIfDb('migration 038 — seed_annexes', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(37);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-038', 'Legal Test 038') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-038-author', 'author-038@tenant-001.example', 'Author 038')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    const sql = await readFile(join(MIGRATIONS_DIR, '038_seed_annexes.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_valid_from = '2025-01-01'`);
      await client.query(sql);
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('inserts 52 annexes with status=draft', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM referentials_annexes
         WHERE tenant_id = $1 AND status = 'draft'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('52');
  });

  it('every annexe has author_user_id set', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM referentials_annexes
         WHERE tenant_id = $1 AND author_user_id IS NULL`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('every annexe has label set (sourced from XLSX LIB_ANNEXE)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM referentials_annexes
         WHERE tenant_id = $1 AND label IS NULL`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('contains annexe code = "00" (Bilan comptable)', async () => {
    const { rows } = await ctx.testPool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM referentials_annexes
           WHERE tenant_id = $1 AND code = '00'
       ) AS exists`,
      [tenantId],
    );
    expect(rows[0]!.exists).toBe(true);
  });

  it('contains annexe code = "910"', async () => {
    const { rows } = await ctx.testPool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM referentials_annexes
           WHERE tenant_id = $1 AND code = '910'
       ) AS exists`,
      [tenantId],
    );
    expect(rows[0]!.exists).toBe(true);
  });
});
