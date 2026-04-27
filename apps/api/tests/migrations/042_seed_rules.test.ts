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

describeIfDb('migration 042 — seed_rules', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(40);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-042', 'Legal Test 042') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-042-author', 'author-042@tenant-001.example', 'Author 042')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    const sql = await readFile(join(MIGRATIONS_DIR, '042_seed_rules.sql'), 'utf8');
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
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('inserts 4611 rules with status=draft', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rules
         WHERE tenant_id = $1 AND status = 'draft'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('4611');
  });

  it('every rule has natural_language set (non-empty)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rules
         WHERE tenant_id = $1
           AND (natural_language IS NULL OR natural_language = '')`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('every rule has terms_count > 0', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rules
         WHERE tenant_id = $1 AND terms_count = 0`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('every rule has type_ctrl_computed set', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM rules
         WHERE tenant_id = $1 AND type_ctrl_computed IS NULL`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('contains rule (ax_term="00", num_regle=1) — first BCT rule', async () => {
    const { rows } = await ctx.testPool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM rules
           WHERE tenant_id = $1 AND ax_term = '00' AND num_regle = 1
       ) AS exists`,
      [tenantId],
    );
    expect(rows[0]!.exists).toBe(true);
  });
});
