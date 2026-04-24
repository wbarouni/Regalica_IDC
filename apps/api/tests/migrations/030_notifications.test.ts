import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 030 — notifications', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(30);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-030', 'Legal Test 030') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-030', 'user-030@tenant-001.example', 'User 030')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertNotif(
    overrides: Partial<{ eventType: string; urgency: string }> = {},
  ): Promise<void> {
    const eventType = overrides.eventType ?? 'deadline_approaching';
    const urgency = overrides.urgency ?? 'info';
    await ctx.testPool.query(
      `INSERT INTO notifications (
         tenant_id, user_id, event_type, urgency_level, title, body
       ) VALUES ($1, $2, $3, $4, 'T', 'B')`,
      [tenantId, userId, eventType, urgency],
    );
  }

  it('creates notifications with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'notifications'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has both the unread-partial and the all-notifications indexes', async () => {
    const { rows } = await ctx.testPool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = $1 AND tablename = 'notifications'`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining(['notifications_idx_user_unread', 'notifications_idx_user_all']),
    );
    const unread = rows.find((r) => r.indexname === 'notifications_idx_user_unread');
    expect(unread?.indexdef).toMatch(/WHERE.*is_read = false/i);
  });

  it('produced_by_agent defaults to NotificationAgent', async () => {
    await insertNotif({ eventType: 'rules_pending_validation' });
    const { rows } = await ctx.testPool.query<{ produced_by_agent: string }>(
      `SELECT produced_by_agent FROM notifications LIMIT 1`,
    );
    expect(rows[0]!.produced_by_agent).toBe('NotificationAgent');
  });

  it('rejects urgency_level outside the 3 enum values', async () => {
    await expect(insertNotif({ urgency: 'critical' })).rejects.toThrow(/notif_ck_urgency/);
  });

  it('rejects event_type outside the 6 enum values', async () => {
    await expect(insertNotif({ eventType: 'unknown_event' })).rejects.toThrow(/notif_ck_event/);
  });

  it('blocks SELECT from another tenant (RLS USING)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-030-other', 'Legal Other 030') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    await insertNotif({ eventType: 'new_circular_detected' });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM notifications`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });
});
