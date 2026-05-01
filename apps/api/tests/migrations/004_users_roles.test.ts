import {
  expectSqlState,
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 004 — users, roles, user_roles, sessions', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(4);
    const { rows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-004', 'Legal Test 004') RETURNING id`,
    );
    tenantId = rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates the four identity tables', async () => {
    const { rows } = await ctx.testPool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name IN ('users', 'roles', 'user_roles', 'sessions')
         ORDER BY table_name`,
      [ctx.schemaName],
    );
    expect(rows.map((r) => r.table_name)).toEqual(['roles', 'sessions', 'user_roles', 'users']);
  });

  it('creates the 3 partial indexes users_idx_active, user_roles_idx_active, sessions_idx_user_active', async () => {
    const { rows } = await ctx.testPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
         WHERE schemaname = $1
           AND indexname IN ('users_idx_active', 'user_roles_idx_active', 'sessions_idx_user_active')
         ORDER BY indexname`,
      [ctx.schemaName],
    );
    expect(rows.map((r) => r.indexname)).toEqual([
      'sessions_idx_user_active',
      'user_roles_idx_active',
      'users_idx_active',
    ]);
  });

  it('users.email is case-insensitive (CITEXT)', async () => {
    await ctx.testPool.query(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-a', 'AliCe@Example.com', 'Alice A')`,
      [tenantId],
    );
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM users
         WHERE tenant_id = $1 AND email = 'alice@example.com'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('users_uk_email enforces per-tenant uniqueness case-insensitively', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
           VALUES ($1, 'sso-b', 'ALICE@EXAMPLE.COM', 'Alice Dup')`,
        [tenantId],
      ),
    ).rejects.toThrow(/users_uk_email/);
  });

  it('user_roles enforces FK to users and roles', async () => {
    // SQLSTATE 23503 foreign_key_violation — locale-stable.
    await expectSqlState(
      ctx.testPool.query(
        `INSERT INTO user_roles (tenant_id, user_id, role_id)
           VALUES ($1,
                   '00000000-0000-7000-8000-000000000001',
                   '00000000-0000-7000-8000-000000000002')`,
        [tenantId],
      ),
      '23503',
    );
  });

  it('sessions_uk_token rejects duplicate token_hash', async () => {
    const userIdRes = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM users WHERE email = 'alice@example.com' LIMIT 1`,
    );
    const userId = userIdRes.rows[0]!.id;
    await ctx.testPool.query(
      `INSERT INTO sessions (tenant_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, 'hash-unique-abc', NOW() + INTERVAL '1 hour')`,
      [tenantId, userId],
    );
    await expect(
      ctx.testPool.query(
        `INSERT INTO sessions (tenant_id, user_id, token_hash, expires_at)
           VALUES ($1, $2, 'hash-unique-abc', NOW() + INTERVAL '1 hour')`,
        [tenantId, userId],
      ),
    ).rejects.toThrow(/sessions_uk_token/);
  });
});
