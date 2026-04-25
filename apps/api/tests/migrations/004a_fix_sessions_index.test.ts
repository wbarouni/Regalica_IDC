import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 004a — sessions_idx_user_active fix', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(4);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('sessions_idx_user_active exists with revoked_at IS NULL predicate only', async () => {
    const { rows } = await ctx.testPool.query<{
      indexname: string;
      indexdef: string;
    }>(
      `SELECT indexname, indexdef
         FROM pg_indexes
         WHERE schemaname = $1
           AND indexname = 'sessions_idx_user_active'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexname).toBe('sessions_idx_user_active');
    // Predicate must NOT contain NOW() — VOLATILE / STABLE functions
    // are rejected by Postgres 16 in index predicates.
    expect(rows[0]!.indexdef).not.toContain('now()');
    expect(rows[0]!.indexdef).toContain('revoked_at IS NULL');
  });
});
