import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 031 — conversations', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let ownerUserId: string;
  let otherUserId: string;
  let directorUserId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(31);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-031', 'Legal Test 031') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-031-owner', 'owner-031@tenant-001.example', 'Owner 031')
         RETURNING id`,
      [tenantId],
    );
    ownerUserId = u.rows[0]!.id;

    const other = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-031-other', 'other-031@tenant-001.example', 'Other 031')
         RETURNING id`,
      [tenantId],
    );
    otherUserId = other.rows[0]!.id;

    const dir = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-031-dir', 'director-031@tenant-001.example', 'Director 031')
         RETURNING id`,
      [tenantId],
    );
    directorUserId = dir.rows[0]!.id;

    // compliance_director is now seeded by migration 007 (Doc 6 §5 + §22.4
    // canon gap closed in commit 2 of the zero-hardcoding sequence).
    const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'compliance_director'`,
      [tenantId],
    );
    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, directorUserId, roleRows[0]!.id],
    );
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertConv(
    client: {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    },
    userId: string,
    overrides: Partial<{ title: string; language: string }> = {},
  ): Promise<void> {
    const title = overrides.title ?? 'A conversation';
    const language = overrides.language ?? 'fr';
    await client.query(
      `INSERT INTO conversations (tenant_id, user_id, title, language)
         VALUES ($1, $2, $3, $4)`,
      [tenantId, userId, title, language],
    );
  }

  it('creates conversations with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'conversations'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the 3 RLS policies (select, insert, update)', async () => {
    const { rows } = await ctx.testPool.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
         WHERE schemaname = $1 AND tablename = 'conversations'
         ORDER BY policyname`,
      [ctx.schemaName],
    );
    expect(rows.map((r) => r.policyname)).toEqual([
      'conversations_insert',
      'conversations_select',
      'conversations_update',
    ]);
  });

  it('rejects language outside fr/en/ar', async () => {
    await expect(insertConv(ctx.testPool, ownerUserId, { language: 'de' })).rejects.toThrow(
      /conv_ck_language/,
    );
  });

  it('accepts fr / en / ar', async () => {
    await insertConv(ctx.testPool, ownerUserId, { title: 'fr-conv', language: 'fr' });
    await insertConv(ctx.testPool, ownerUserId, { title: 'en-conv', language: 'en' });
    await insertConv(ctx.testPool, ownerUserId, { title: 'ar-conv', language: 'ar' });
  });

  it('RLS SELECT: owner sees own conversation', async () => {
    await insertConv(ctx.testPool, ownerUserId, { title: 'owner-visible' });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${ownerUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM conversations WHERE title = 'owner-visible'`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('1');
    } finally {
      client.release();
    }
  });

  it('RLS SELECT: unrelated user does not see other users conversation', async () => {
    await insertConv(ctx.testPool, ownerUserId, { title: 'hidden-from-other' });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${otherUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM conversations WHERE title = 'hidden-from-other'`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });

  it('RLS SELECT: compliance_director sees other users conversations in same tenant', async () => {
    await insertConv(ctx.testPool, ownerUserId, { title: 'director-visible' });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${directorUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM conversations WHERE title = 'director-visible'`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('1');
    } finally {
      client.release();
    }
  });

  it('migration 031 installs validation_runs_fk_conversation on validation_runs.conversation_id', async () => {
    const { rows } = await ctx.testPool.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = $1
           AND table_name = 'validation_runs'
           AND constraint_name = 'validation_runs_fk_conversation'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
  });
});
