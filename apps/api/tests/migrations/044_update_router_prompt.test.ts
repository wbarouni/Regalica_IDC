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

describeIfDb('migration 044 — update_router_prompt', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  beforeAll(async () => {
    // Stop at 042: 043 + 044 are applied manually below with the
    // seed session vars set, so they actually mutate prompt_bank
    // (the in-loop application would skip both via missing-ok guards).
    ctx = await setupMigrationsSchema(42);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-044', 'Legal Test 044') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-044-author', 'author-044@tenant-001.example', 'Author 044')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    // platform_owner role auto-seeded by tenants trigger; assign it to
    // the author so the prompt_bank RLS policies (gated on
    // current_user_has_role('platform_owner')) accept the inserts +
    // the 044 UPDATE.
    const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'platform_owner'`,
      [tenantId],
    );
    const platformOwnerRoleId = roleRows[0]!.id;
    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, authorId, platformOwnerRoleId],
    );

    const seed043 = await readFile(join(MIGRATIONS_DIR, '043_seed_prompt_bank.sql'), 'utf8');
    const update044 = await readFile(join(MIGRATIONS_DIR, '044_update_router_prompt.sql'), 'utf8');

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_valid_from = '2025-01-01'`);
      await client.query(seed043);
      await client.query(update044);
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('replaces the placeholder template with the real prompt', async () => {
    const { rows } = await ctx.testPool.query<{ template: string }>(
      `SELECT template FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'regalica'
           AND function_name = 'router'
           AND version = 1`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    const template = rows[0]!.template;
    expect(template).not.toContain('[REGALICA_ROUTER_V1]');
    expect(template).toContain('zoom_fail');
    expect(template).toContain('general_help');
    expect(template).toContain('{user_message}');
  });

  it('lists the 10 enum values in the template', async () => {
    const { rows } = await ctx.testPool.query<{ template: string }>(
      `SELECT template FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'regalica'
           AND function_name = 'router'
           AND version = 1`,
      [tenantId],
    );
    const template = rows[0]!.template;
    const enumValues = [
      'zoom_fail',
      'grappe_cause_racine',
      'historique_recurrence',
      'citation_reglementaire',
      'simulation_impact',
      'estimation_sanction',
      'plan_optimal',
      'ambiguous',
      'out_of_scope',
      'general_help',
    ];
    for (const v of enumValues) {
      expect(template).toContain(v);
    }
  });

  it('keeps the runtime parameters unchanged (temperature 0.0, no thinking)', async () => {
    const { rows } = await ctx.testPool.query<{
      temperature: string;
      thinking_enabled: boolean;
      max_tokens: number;
      target_model: string;
    }>(
      `SELECT temperature::text AS temperature,
              thinking_enabled,
              max_tokens,
              target_model
         FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'regalica'
           AND function_name = 'router'
           AND version = 1`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.temperature)).toBe(0.0);
    expect(rows[0]!.thinking_enabled).toBe(false);
    expect(rows[0]!.max_tokens).toBe(1024);
    expect(rows[0]!.target_model).toBe('gemini-2.5-flash');
  });

  it('keeps the row in draft status (4-eyes promotion still required)', async () => {
    const { rows } = await ctx.testPool.query<{ status: string }>(
      `SELECT status FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'regalica'
           AND function_name = 'router'
           AND version = 1`,
      [tenantId],
    );
    expect(rows[0]!.status).toBe('draft');
  });

  it('does not modify any other prompt_bank row', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1
           AND template LIKE '[%_V1]'`,
      [tenantId],
    );
    // 22 seeded - 1 router updated = 21 remaining placeholders.
    expect(rows[0]!.count).toBe('21');
  });
});
