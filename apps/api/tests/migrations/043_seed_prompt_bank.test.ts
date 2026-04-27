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

describeIfDb('migration 043 — seed_prompt_bank', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(42);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-043', 'Legal Test 043') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-043-author', 'author-043@tenant-001.example', 'Author 043')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    // The platform_owner role was auto-seeded by the tenants trigger from
    // migration 007. Assign it to the author so the prompt_bank RLS
    // policies (gated on current_user_has_role('platform_owner')) accept
    // the seed inserts.
    const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'platform_owner'`,
      [tenantId],
    );
    const platformOwnerRoleId = roleRows[0]!.id;
    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, authorId, platformOwnerRoleId],
    );

    const sql = await readFile(join(MIGRATIONS_DIR, '043_seed_prompt_bank.sql'), 'utf8');
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

  it('inserts 22 prompts with status=draft', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1 AND status = 'draft'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('22');
  });

  it('seeds 12 Regalica sub-prompts (router + planner + 10 aggregators)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1 AND agent_type = 'regalica'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('12');
  });

  it('has 5 entries with thinking_enabled=true (long-form aggregators)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1 AND thinking_enabled = TRUE`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('5');
  });

  it('has 4 entries at temperature=0.7 (zoom_fail, grappe, historique, plan_optimal)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1 AND temperature = 0.7`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('4');
  });

  it('has 2 entries at temperature=0.0 (router + planner, deterministic classification)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1 AND temperature = 0.0`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('2');
  });

  it('every prompt has a non-null author_user_id', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1 AND author_user_id IS NULL`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('contains ReporterAgent twice (docx + pdf, distinct function_name)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1 AND agent_type = 'reporter'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('2');
  });
});
