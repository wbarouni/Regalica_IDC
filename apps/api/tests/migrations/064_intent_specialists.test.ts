import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 064 — intent_specialists schema', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(64);
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates intent_specialists with RLS forced and open SELECT', async () => {
    const { rows } = await ctx.testPool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'intent_specialists' AND n.nspname = $1`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('creates intent_specialist_bearers with RLS forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT c.relrowsecurity, c.relforcerowsecurity
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = 'intent_specialist_bearers' AND n.nspname = $1`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('rejects status=active with same author and validator (4-yeux)', async () => {
    // Insert a tenant + user authored row; promotion to active with
    // validator==author must violate ck_four_eyes.
    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name) VALUES ('tenant-test-064', 'L') RETURNING id`,
    );
    const tenantId = t.rows[0]!.id;
    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-064', 'a@x.example', 'A') RETURNING id`,
      [tenantId],
    );
    const userId = u.rows[0]!.id;

    await expect(
      ctx.testPool.query(
        `INSERT INTO intent_specialists
           (intent_type, aggregator_agent_type, aggregator_function_name,
            specialist_ids, ordinal, author_user_id, validator_user_id, status)
         VALUES ('zoom', 'regalica', 'aggregate_zoom_fail',
                 '[]'::jsonb, 1, $1, $1, 'active')`,
        [userId],
      ),
    ).rejects.toThrow(/intent_specialists_ck_four_eyes/);
  });

  it('rejects specialist_ids that is not a JSON array', async () => {
    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name) VALUES ('tenant-test-064b', 'L') RETURNING id`,
    );
    const tenantId = t.rows[0]!.id;
    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-064b', 'b@x.example', 'B') RETURNING id`,
      [tenantId],
    );
    await expect(
      ctx.testPool.query(
        `INSERT INTO intent_specialists
           (intent_type, aggregator_agent_type, aggregator_function_name,
            specialist_ids, ordinal, author_user_id, status)
         VALUES ('test_obj', 'regalica', 'aggregate_zoom_fail',
                 '{}'::jsonb, 99, $1, 'draft')`,
        [u.rows[0]!.id],
      ),
    ).rejects.toThrow(/specialist_ids_array/);
  });

  it('exposes both v_intent_specialists_active and v_intent_specialist_bearers_active views', async () => {
    const { rows } = await ctx.testPool.query<{ name: string }>(
      `SELECT c.relname AS name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'v'
          AND n.nspname = $1
          AND c.relname IN ('v_intent_specialists_active', 'v_intent_specialist_bearers_active')
        ORDER BY c.relname`,
      [ctx.schemaName],
    );
    expect(rows.map((r) => r.name)).toEqual([
      'v_intent_specialist_bearers_active',
      'v_intent_specialists_active',
    ]);
  });
});
