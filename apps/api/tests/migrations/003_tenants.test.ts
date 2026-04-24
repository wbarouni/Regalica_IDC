import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 003 — tenants', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(3);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates the tenants table with expected columns and defaults', async () => {
    const { rows } = await ctx.testPool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'tenants'
         ORDER BY ordinal_position`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.column_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'slug',
        'legal_name',
        'bct_bank_code',
        'default_language',
        'timezone',
        'deployment_mode',
        'sso_provider',
        'sso_config',
        'is_active',
        'activated_at',
        'suspended_at',
        'created_at',
        'updated_at',
      ]),
    );
  });

  it('accepts a minimal tenant insert and applies defaults', async () => {
    const { rows } = await ctx.testPool.query<{
      default_language: string;
      deployment_mode: string;
      is_active: boolean;
    }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-a', 'Legal Test A')
         RETURNING default_language, deployment_mode, is_active`,
    );
    expect(rows[0]!.default_language).toBe('fr');
    expect(rows[0]!.deployment_mode).toBe('on_premises');
    expect(rows[0]!.is_active).toBe(true);
  });

  it('rejects an unsupported default_language via tenants_ck_language', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO tenants (slug, legal_name, default_language)
           VALUES ('tenant-test-b', 'Legal Test B', 'zz')`,
      ),
    ).rejects.toThrow(/tenants_ck_language/);
  });

  it('rejects an unsupported deployment_mode via tenants_ck_deployment', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO tenants (slug, legal_name, deployment_mode)
           VALUES ('tenant-test-c', 'Legal Test C', 'serverless')`,
      ),
    ).rejects.toThrow(/tenants_ck_deployment/);
  });

  it('rejects a duplicate slug via the UNIQUE constraint', async () => {
    await ctx.testPool.query(
      `INSERT INTO tenants (slug, legal_name) VALUES ('tenant-test-dup', 'D1')`,
    );
    await expect(
      ctx.testPool.query(`INSERT INTO tenants (slug, legal_name) VALUES ('tenant-test-dup', 'D2')`),
    ).rejects.toThrow(/duplicate key/);
  });
});
