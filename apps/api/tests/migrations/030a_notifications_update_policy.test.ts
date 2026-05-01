import {
  expectSqlState,
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 030a — notifications UPDATE policy', () => {
  let ctx: MigrationsTestContext;
  let tenantA: string;
  let tenantB: string;
  let userA1: string;
  let userA2: string;
  let userB1: string;
  let notifA1: string;
  let notifA2: string;
  let notifB1: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(30);

    // Two tenants — A (the one we will set as current) and B (foreign).
    const tA = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-030a-A', 'Legal A 030a') RETURNING id`,
    );
    tenantA = tA.rows[0]!.id;
    const tB = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-030a-B', 'Legal B 030a') RETURNING id`,
    );
    tenantB = tB.rows[0]!.id;

    // Two users in tenant A, one in tenant B.
    const uA1 = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-030a-A1', 'a1@tenant-001.example', 'A1')
         RETURNING id`,
      [tenantA],
    );
    userA1 = uA1.rows[0]!.id;
    const uA2 = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-030a-A2', 'a2@tenant-001.example', 'A2')
         RETURNING id`,
      [tenantA],
    );
    userA2 = uA2.rows[0]!.id;
    const uB1 = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-030a-B1', 'b1@tenant-001.example', 'B1')
         RETURNING id`,
      [tenantB],
    );
    userB1 = uB1.rows[0]!.id;

    // One notification per user.
    const insert = async (tenantId: string, userId: string, title: string): Promise<string> => {
      const r = await ctx.testPool.query<{ id: string }>(
        `INSERT INTO notifications (
           tenant_id, user_id, event_type, urgency_level, title, body
         ) VALUES ($1, $2, 'deadline_approaching', 'info', $3, 'body')
         RETURNING id`,
        [tenantId, userId, title],
      );
      return r.rows[0]!.id;
    };
    notifA1 = await insert(tenantA, userA1, 'A1-own');
    notifA2 = await insert(tenantA, userA2, 'A2-own');
    notifB1 = await insert(tenantB, userB1, 'B1-own');
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('declares the UPDATE policy on notifications', async () => {
    const { rows } = await ctx.testPool.query<{ policyname: string; cmd: string }>(
      `SELECT policyname, cmd FROM pg_policies
         WHERE schemaname = $1 AND tablename = 'notifications'
         ORDER BY policyname`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => `${r.policyname}/${r.cmd}`);
    expect(names).toEqual(
      expect.arrayContaining(['notifications_select/SELECT', 'notifications_update/UPDATE']),
    );
  });

  it('allows a user to mark their own notification as read', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantA}'`);
      await client.query(`SET LOCAL app.current_user_id = '${userA1}'`);

      const { rowCount } = await client.query(
        `UPDATE notifications
            SET is_read = TRUE, read_at = NOW()
          WHERE id = $1`,
        [notifA1],
      );
      await client.query('COMMIT');
      expect(rowCount).toBe(1);
    } finally {
      client.release();
    }

    const { rows } = await ctx.testPool.query<{ is_read: boolean }>(
      `SELECT is_read FROM notifications WHERE id = $1`,
      [notifA1],
    );
    expect(rows[0]!.is_read).toBe(true);
  });

  it("blocks a user from marking another user's notification (same tenant)", async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantA}'`);
      await client.query(`SET LOCAL app.current_user_id = '${userA1}'`);

      const { rowCount } = await client.query(
        `UPDATE notifications
            SET is_read = TRUE
          WHERE id = $1`,
        [notifA2],
      );
      await client.query('COMMIT');
      expect(rowCount).toBe(0);
    } finally {
      client.release();
    }

    const { rows } = await ctx.testPool.query<{ is_read: boolean }>(
      `SELECT is_read FROM notifications WHERE id = $1`,
      [notifA2],
    );
    expect(rows[0]!.is_read).toBe(false);
  });

  it('blocks a user from updating a notification in another tenant', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantA}'`);
      await client.query(`SET LOCAL app.current_user_id = '${userA1}'`);

      const { rowCount } = await client.query(
        `UPDATE notifications
            SET is_read = TRUE
          WHERE id = $1`,
        [notifB1],
      );
      await client.query('COMMIT');
      expect(rowCount).toBe(0);
    } finally {
      client.release();
    }

    const { rows } = await ctx.testPool.query<{ is_read: boolean }>(
      `SELECT is_read FROM notifications WHERE id = $1`,
      [notifB1],
    );
    expect(rows[0]!.is_read).toBe(false);
  });

  it('blocks UPDATE that would migrate ownership to another user', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantA}'`);
      await client.query(`SET LOCAL app.current_user_id = '${userA1}'`);

      // Try to reassign A1's notification to A2 — WITH CHECK must reject.
      // SQLSTATE 42501 insufficient_privilege — locale-stable RLS denial.
      await expectSqlState(
        client.query(
          `UPDATE notifications
              SET user_id = $1
            WHERE id = $2`,
          [userA2, notifA1],
        ),
        '42501',
      );
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
