import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 032 — messages', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;
  let otherUserId: string;
  let conversationId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(32);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-032', 'Legal Test 032') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-032', 'user-032@tenant-001.example', 'User 032')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;

    const other = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-032-other', 'other-032@tenant-001.example', 'Other 032')
         RETURNING id`,
      [tenantId],
    );
    otherUserId = other.rows[0]!.id;

    const conv = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO conversations (tenant_id, user_id, title)
         VALUES ($1, $2, 'conv-032') RETURNING id`,
      [tenantId, userId],
    );
    conversationId = conv.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertMessage(
    overrides: Partial<{
      sequence: number;
      role: string;
      confidence: string | null;
    }> = {},
  ): Promise<string> {
    const sequence = overrides.sequence ?? 1;
    const role = overrides.role ?? 'user';
    const confidence = overrides.confidence === undefined ? null : overrides.confidence;
    const { rows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO messages (
         tenant_id, conversation_id, sequence_number, role,
         content_markdown, confidence_level
       ) VALUES ($1, $2, $3, $4, 'body', $5) RETURNING id`,
      [tenantId, conversationId, sequence, role, confidence],
    );
    return rows[0]!.id;
  }

  it('creates messages with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'messages'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the 2 expected indexes', async () => {
    const { rows } = await ctx.testPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
         WHERE schemaname = $1 AND tablename = 'messages'`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(expect.arrayContaining(['msg_idx_conv_seq', 'msg_idx_tenant_created']));
  });

  it('rejects role outside the 5 enum values', async () => {
    await expect(insertMessage({ sequence: 100, role: 'unknown_role' })).rejects.toThrow(
      /msg_ck_role/,
    );
  });

  it('rejects confidence_level outside the 4 enum values', async () => {
    await expect(
      insertMessage({ sequence: 101, role: 'regalica_response', confidence: 'certain' }),
    ).rejects.toThrow(/msg_ck_confidence/);
  });

  it('enforces UNIQUE (conversation_id, sequence_number)', async () => {
    await insertMessage({ sequence: 200 });
    await expect(insertMessage({ sequence: 200 })).rejects.toThrow(/msg_uk_sequence/);
  });

  it('immutability: UPDATE is forbidden', async () => {
    const id = await insertMessage({ sequence: 300 });
    await expect(
      ctx.testPool.query(`UPDATE messages SET content_markdown = 'tampered' WHERE id = $1`, [id]),
    ).rejects.toThrow(/messages is insert-only; UPDATE is forbidden/);
  });

  it('immutability: DELETE is forbidden', async () => {
    const id = await insertMessage({ sequence: 301 });
    await expect(ctx.testPool.query(`DELETE FROM messages WHERE id = $1`, [id])).rejects.toThrow(
      /messages is insert-only; DELETE is forbidden/,
    );
  });

  it('has the messages_immutability trigger attached', async () => {
    const { rows } = await ctx.testPool.query<{ tgname: string }>(
      `SELECT t.tgname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relname = 'messages'
           AND c.relnamespace = to_regnamespace($1)::oid
           AND NOT t.tgisinternal
           AND t.tgname = 'messages_immutability'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
  });

  it('RLS SELECT: owner of the conversation sees their messages', async () => {
    await insertMessage({ sequence: 400 });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM messages WHERE sequence_number = 400`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('1');
    } finally {
      client.release();
    }
  });

  it('RLS SELECT: unrelated user does not see messages of another user', async () => {
    await insertMessage({ sequence: 401 });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${otherUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM messages WHERE sequence_number = 401`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });
});
