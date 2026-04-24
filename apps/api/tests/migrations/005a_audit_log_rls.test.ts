import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

// Target tier 7 so the tenants_seed_roles trigger has run and the role
// catalogue (compliance_director, support_readonly, platform_owner)
// exists — the §22.5 policy body references those role codes via
// current_user_has_role().
describeIfDb('migration 005a — audit_log RLS', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let actorUserId: string;
  let otherUserId: string;
  let directorUserId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(7);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-005a', 'Legal Test 005a') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const a = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-005a-actor', 'actor@tenant-001.example', 'Actor')
         RETURNING id`,
      [tenantId],
    );
    actorUserId = a.rows[0]!.id;

    const o = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-005a-other', 'other@tenant-001.example', 'Other')
         RETURNING id`,
      [tenantId],
    );
    otherUserId = o.rows[0]!.id;

    const d = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-005a-dir', 'director@tenant-001.example', 'Director')
         RETURNING id`,
      [tenantId],
    );
    directorUserId = d.rows[0]!.id;

    const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'compliance_director'`,
      [tenantId],
    );
    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, directorUserId, roleRows[0]!.id],
    );

    // Manual INSERT into audit_log (the audit_trigger_function isn't
    // attached to any table yet at this tier).
    await ctx.testPool.query(
      `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'INSERT', 'test_entity', uuidv7())`,
      [tenantId, actorUserId],
    );
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('audit_log has RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'audit_log'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the audit_log_select policy and no other policy', async () => {
    const { rows } = await ctx.testPool.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
         WHERE schemaname = $1 AND tablename = 'audit_log'
         ORDER BY policyname`,
      [ctx.schemaName],
    );
    expect(rows.map((r) => r.policyname)).toEqual(['audit_log_select']);
  });

  it('RLS SELECT: actor sees own audit rows (tenant + self match)', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${actorUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_log`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('1');
    } finally {
      client.release();
    }
  });

  it('RLS SELECT: unrelated user does not see another actor rows', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${otherUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_log`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });

  it('RLS SELECT: compliance_director sees other actors rows in same tenant', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${directorUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_log`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('1');
    } finally {
      client.release();
    }
  });

  it('RLS SELECT: cross-tenant isolation blocks reads', async () => {
    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-005a-other', 'Legal Other 005a') RETURNING id`,
    );
    const otherTenantId = tRows[0]!.id;

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${actorUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit_log`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });
});
