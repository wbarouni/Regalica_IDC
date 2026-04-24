import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 005 — audit_log partitioned + immutability', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(5);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates audit_log as a range-partitioned table', async () => {
    const { rows } = await ctx.testPool.query<{ relkind: string }>(
      `SELECT relkind FROM pg_class
         WHERE relname = 'audit_log'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    // 'p' = partitioned table, 'r' = regular table
    expect(rows[0]!.relkind).toBe('p');
  });

  it('creates the current-month bootstrap partition', async () => {
    const { rows } = await ctx.testPool.query<{ child: string }>(
      `SELECT c.relname AS child
         FROM pg_inherits i
         JOIN pg_class c     ON c.oid = i.inhrelid
         JOIN pg_class p     ON p.oid = i.inhparent
         WHERE p.relname = 'audit_log'
           AND p.relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const expectedName = `audit_log_${new Date().toISOString().slice(0, 7).replace('-', '_')}`;
    expect(rows.map((r) => r.child)).toContain(expectedName);
  });

  it('allows INSERT on audit_log', async () => {
    await ctx.testPool.query(
      `INSERT INTO audit_log (
         tenant_id, action, entity_type, entity_id
       ) VALUES (
         '00000000-0000-7000-8000-000000000001',
         'create',
         'rule',
         '00000000-0000-7000-8000-000000000002'
       )`,
    );
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM audit_log`,
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('rejects UPDATE on audit_log via the immutability trigger', async () => {
    await expect(
      ctx.testPool.query(`UPDATE audit_log SET action = 'tampered' WHERE entity_type = 'rule'`),
    ).rejects.toThrow(/audit_log is insert-only/);
  });

  it('rejects DELETE on audit_log via the immutability trigger', async () => {
    await expect(
      ctx.testPool.query(`DELETE FROM audit_log WHERE entity_type = 'rule'`),
    ).rejects.toThrow(/audit_log is insert-only/);
  });
});
