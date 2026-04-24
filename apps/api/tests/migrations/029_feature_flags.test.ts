import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 029 — feature_flags', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(29);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-029', 'Legal Test 029') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-029', 'user-029@tenant-001.example', 'User 029')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertFlag(
    overrides: Partial<{ flagKey: string; rollout: number }> = {},
  ): Promise<void> {
    const flagKey = overrides.flagKey ?? 'default_flag';
    const rollout = overrides.rollout ?? 0;
    await ctx.testPool.query(
      `INSERT INTO feature_flags (
         tenant_id, flag_key, rollout_percentage, created_by_user_id
       ) VALUES ($1, $2, $3, $4)`,
      [tenantId, flagKey, rollout, userId],
    );
  }

  it('feature_flags does NOT have RLS enabled (per §22.6)', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
    }>(
      `SELECT relrowsecurity FROM pg_class
         WHERE relname = 'feature_flags'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(false);
  });

  it('enforces UNIQUE (tenant_id, flag_key)', async () => {
    await insertFlag({ flagKey: 'dup_key' });
    await expect(insertFlag({ flagKey: 'dup_key' })).rejects.toThrow(/feature_flags_uk/);
  });

  it('rejects rollout_percentage = -1', async () => {
    await expect(insertFlag({ flagKey: 'neg', rollout: -1 })).rejects.toThrow(
      /feature_flags_ck_rollout/,
    );
  });

  it('rejects rollout_percentage = 101', async () => {
    await expect(insertFlag({ flagKey: 'over', rollout: 101 })).rejects.toThrow(
      /feature_flags_ck_rollout/,
    );
  });

  it('accepts rollout_percentage in [0, 100]', async () => {
    await insertFlag({ flagKey: 'zero', rollout: 0 });
    await insertFlag({ flagKey: 'hundred', rollout: 100 });
    await insertFlag({ flagKey: 'mid', rollout: 42 });
  });
});
