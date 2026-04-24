import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const EXPECTED_ROLE_CODES = [
  'auditor',
  'compliance_officer',
  'platform_owner',
  'prompt_editor',
  'referential_editor',
  'rule_editor',
  'signatory',
  'tenant_admin',
];

describeIfDb('migration 007 — seed_system_roles', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(7);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates the seed_system_roles_for_tenant function', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pg_proc
         WHERE proname = 'seed_system_roles_for_tenant'
           AND pronamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('installs the tenants_seed_roles trigger on tenants', async () => {
    const { rows } = await ctx.testPool.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger
         WHERE tgname = 'tenants_seed_roles' AND NOT tgisinternal`,
    );
    expect(rows).toHaveLength(1);
  });

  it('inserts the 8 system roles when a new tenant is created', async () => {
    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-007-a', 'Legal Test 007 A') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;

    const { rows } = await ctx.testPool.query<{ code: string; is_system_role: boolean }>(
      `SELECT code, is_system_role FROM roles
         WHERE tenant_id = $1
         ORDER BY code`,
      [tenantId],
    );
    expect(rows.map((r) => r.code)).toEqual(EXPECTED_ROLE_CODES);
    expect(rows.every((r) => r.is_system_role)).toBe(true);
  });

  it('seeded roles carry the Phase 1 minimal permissions marker', async () => {
    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-007-b', 'Legal Test 007 B') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;

    const { rows } = await ctx.testPool.query<{
      permissions: { v: number; capabilities: unknown[] };
    }>(
      `SELECT permissions FROM roles
         WHERE tenant_id = $1 AND code = 'compliance_officer'`,
      [tenantId],
    );
    expect(rows[0]!.permissions.v).toBe(1);
    expect(Array.isArray(rows[0]!.permissions.capabilities)).toBe(true);
    expect(rows[0]!.permissions.capabilities).toHaveLength(0);
  });

  it('seed function is idempotent: a second manual call creates no duplicate', async () => {
    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-007-c', 'Legal Test 007 C') RETURNING id`,
    );
    const tenantId = tRows[0]!.id;

    await ctx.testPool.query(`SELECT seed_system_roles_for_tenant($1)`, [tenantId]);

    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM roles WHERE tenant_id = $1`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('8');
  });
});
