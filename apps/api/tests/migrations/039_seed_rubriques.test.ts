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

describeIfDb('migration 039 — seed_rubriques', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(38);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-039', 'Legal Test 039') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-039-author', 'author-039@tenant-001.example', 'Author 039')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    const sql = await readFile(join(MIGRATIONS_DIR, '039_seed_rubriques.sql'), 'utf8');
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

  it('inserts 1103 rubriques with status=draft', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM referentials_rubriques
         WHERE tenant_id = $1 AND status = 'draft'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('1103');
  });

  it('every rubrique has author_user_id set', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM referentials_rubriques
         WHERE tenant_id = $1 AND author_user_id IS NULL`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('every rubrique has label NULL (no XLSX source — TODO 4-eyes enrichment)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM referentials_rubriques
         WHERE tenant_id = $1 AND label IS NOT NULL`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('every rubrique has annexe_code set', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM referentials_rubriques
         WHERE tenant_id = $1 AND annexe_code IS NULL`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('contains rubrique code = "AC050100000000"', async () => {
    const { rows } = await ctx.testPool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM referentials_rubriques
           WHERE tenant_id = $1 AND code = 'AC050100000000'
       ) AS exists`,
      [tenantId],
    );
    expect(rows[0]!.exists).toBe(true);
  });
});
