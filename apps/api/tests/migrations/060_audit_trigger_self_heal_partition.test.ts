import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 060 — audit_trigger_function self-heals missing partition', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    // Apply through migration 060 inclusive — the test schema gets the
    // patched audit_trigger_function and we exercise it via a write
    // that fires the trigger.
    ctx = await setupMigrationsSchema(60);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-060', 'Legal Test 060') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-060', 'author-060@tenant-001.example', 'Author 060')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertAuditedAnnexe(suffix: string): Promise<void> {
    // referentials_annexes carries audit_trigger_function (migration 008)
    // and is a clean choice — no FK to validation_runs / uploads.
    await ctx.testPool.query(
      `INSERT INTO referentials_annexes
         (tenant_id, code, label, valid_from, author_user_id, status)
       VALUES ($1, $2, $3, NOW(), $4, 'draft')`,
      [tenantId, `TST-060-${suffix}`, `Test annexe ${suffix}`, userId],
    );
  }

  it('drops the current-month audit_log partition then succeeds on a new audited write (regression for /agents 500)', async () => {
    // Reproduce the production failure mode: between migration 005's
    // bootstrap month and the next pg_cron run, the live partition for
    // the active month may be missing. Drop it then write — the
    // patched trigger must recreate it transparently.
    const partName = await ctx.testPool.query<{ name: string }>(
      `SELECT 'audit_log_' || to_char(date_trunc('month', NOW())::date, 'YYYY_MM') AS name`,
    );
    const currentPartition = partName.rows[0]!.name;

    // Find the partition's actual schema (search_path-resolved at the
    // time migration 005 ran), then drop it from there.
    const partSchema = await ctx.testPool.query<{ schema: string }>(
      `SELECT n.nspname AS schema
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = $1
        ORDER BY (n.nspname = $2) DESC
        LIMIT 1`,
      [currentPartition, ctx.schemaName],
    );
    const schema = partSchema.rows[0]!.schema;
    await ctx.testPool.query(
      `ALTER TABLE audit_log DETACH PARTITION ${schema}.${currentPartition}`,
    );
    await ctx.testPool.query(`DROP TABLE ${schema}.${currentPartition}`);

    // Confirm the partition is gone in the resolved schema before the
    // trigger runs.
    const beforeProbe = await ctx.testPool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = $1 AND n.nspname = $2
       ) AS exists`,
      [currentPartition, schema],
    );
    expect(beforeProbe.rows[0]!.exists).toBe(false);

    // Set the actor GUC so the trigger's current_app_user_id() resolves.
    await ctx.testPool.query(`SELECT set_config('app.current_user_id', $1, false)`, [userId]);
    await ctx.testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);

    // Trigger an audited INSERT — this is what the production /agents
    // route does indirectly through INSERT INTO run_agent_steps.
    await expect(insertAuditedAnnexe('after-drop')).resolves.toBeUndefined();

    // Partition must now exist (regardless of the schema the trigger
    // resolved it into via search_path).
    const afterProbe = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM pg_class
         WHERE relname = $1 AND relkind = 'r'`,
      [currentPartition],
    );
    expect(Number(afterProbe.rows[0]!.count)).toBeGreaterThan(0);

    const auditCount = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_log
         WHERE entity_type = 'referentials_annexes'
           AND created_at >= date_trunc('month', NOW())`,
    );
    expect(Number(auditCount.rows[0]!.count)).toBeGreaterThan(0);
  });

  it('is a no-op cost when the partition already exists (idempotent CREATE IF NOT EXISTS)', async () => {
    // Two sequential audited writes — the second must reuse the
    // partition created by the first without raising.
    await ctx.testPool.query(`SELECT set_config('app.current_user_id', $1, false)`, [userId]);
    await ctx.testPool.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);
    await insertAuditedAnnexe('idem-a');
    await expect(insertAuditedAnnexe('idem-b')).resolves.toBeUndefined();
  });
});
