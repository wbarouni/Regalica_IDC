import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 006 — audit_trigger_function', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(6);

    // We need a tenant for audit_log.tenant_id FK (via the trigger body).
    const { rows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-006', 'Legal Test 006') RETURNING id`,
    );
    tenantId = rows[0]!.id;

    // Dummy audited table + trigger attachment (exercises the function
    // the way real tables like rules / prompt_bank / referentials_* will
    // in later migrations).
    await ctx.testPool.query(`
      CREATE TABLE widgets (
        id        UUID PRIMARY KEY DEFAULT uuidv7(),
        tenant_id UUID NOT NULL,
        label     TEXT NOT NULL,
        value     INTEGER
      );
    `);
    await ctx.testPool.query(`
      CREATE TRIGGER widgets_audit
        AFTER INSERT OR UPDATE OR DELETE ON widgets
        FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
    `);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates the audit_trigger_function', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pg_proc
         WHERE proname = 'audit_trigger_function'
           AND pronamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('logs INSERT with old_value=NULL and new_value populated', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_user_id = '00000000-0000-7000-8000-000000000001'`);
      await client.query(`INSERT INTO widgets (tenant_id, label, value) VALUES ($1, 'alpha', 10)`, [
        tenantId,
      ]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const { rows } = await ctx.testPool.query<{
      action: string;
      entity_type: string;
      actor_user_id: string;
      tenant_id: string;
      old_value: unknown;
      new_value: { label: string };
    }>(
      `SELECT action, entity_type, actor_user_id, tenant_id, old_value, new_value
         FROM audit_log
         WHERE entity_type = 'widgets'
         ORDER BY created_at DESC
         LIMIT 1`,
    );
    expect(rows[0]!.action).toBe('INSERT');
    expect(rows[0]!.entity_type).toBe('widgets');
    expect(rows[0]!.actor_user_id).toBe('00000000-0000-7000-8000-000000000001');
    expect(rows[0]!.tenant_id).toBe(tenantId);
    expect(rows[0]!.old_value).toBeNull();
    expect(rows[0]!.new_value.label).toBe('alpha');
  });

  it('logs UPDATE with both old_value and new_value', async () => {
    await ctx.testPool.query(`UPDATE widgets SET value = 99 WHERE label = 'alpha'`);
    const { rows } = await ctx.testPool.query<{
      action: string;
      old_value: { value: number };
      new_value: { value: number };
    }>(
      `SELECT action, old_value, new_value
         FROM audit_log
         WHERE entity_type = 'widgets' AND action = 'UPDATE'
         ORDER BY created_at DESC
         LIMIT 1`,
    );
    expect(rows[0]!.action).toBe('UPDATE');
    expect(rows[0]!.old_value.value).toBe(10);
    expect(rows[0]!.new_value.value).toBe(99);
  });

  it('logs DELETE with new_value=NULL and actor NULL when session var is unset', async () => {
    await ctx.testPool.query(`DELETE FROM widgets WHERE label = 'alpha'`);
    const { rows } = await ctx.testPool.query<{
      action: string;
      new_value: unknown;
      old_value: { label: string };
      actor_user_id: string | null;
    }>(
      `SELECT action, new_value, old_value, actor_user_id
         FROM audit_log
         WHERE entity_type = 'widgets' AND action = 'DELETE'
         ORDER BY created_at DESC
         LIMIT 1`,
    );
    expect(rows[0]!.action).toBe('DELETE');
    expect(rows[0]!.new_value).toBeNull();
    expect(rows[0]!.old_value.label).toBe('alpha');
    expect(rows[0]!.actor_user_id).toBeNull();
  });
});
