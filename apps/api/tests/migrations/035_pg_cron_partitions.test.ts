import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 035 — audit_log partition management', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(35);
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('installs the three partition-management functions', async () => {
    const { rows } = await ctx.testPool.query<{ proname: string }>(
      `SELECT proname FROM pg_proc
         WHERE pronamespace = to_regnamespace($1)::oid
           AND proname IN (
             'audit_log_create_partition_for_month',
             'audit_log_create_next_month_partition',
             'audit_log_detach_old_partitions'
           )
         ORDER BY proname`,
      [ctx.schemaName],
    );
    expect(rows.map((r) => r.proname)).toEqual([
      'audit_log_create_next_month_partition',
      'audit_log_create_partition_for_month',
      'audit_log_detach_old_partitions',
    ]);
  });

  it('create_partition_for_month creates and attaches a partition', async () => {
    const { rows } = await ctx.testPool.query<{ part_name: string }>(
      `SELECT audit_log_create_partition_for_month(2030, 3) AS part_name`,
    );
    expect(rows[0]!.part_name).toBe('audit_log_2030_03');

    const { rows: inh } = await ctx.testPool.query<{ child: string }>(
      `SELECT c.relname AS child
         FROM pg_inherits i
         JOIN pg_class c ON c.oid = i.inhrelid
         WHERE i.inhparent = 'audit_log'::regclass
           AND c.relname = 'audit_log_2030_03'`,
    );
    expect(inh).toHaveLength(1);
  });

  it('create_partition_for_month is idempotent', async () => {
    await ctx.testPool.query(`SELECT audit_log_create_partition_for_month(2031, 7)`);
    await ctx.testPool.query(`SELECT audit_log_create_partition_for_month(2031, 7)`);
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM pg_class c
         WHERE c.relname = 'audit_log_2031_07'
           AND c.relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('create_next_month_partition creates the month after current', async () => {
    const { rows } = await ctx.testPool.query<{ part_name: string }>(
      `SELECT audit_log_create_next_month_partition() AS part_name`,
    );
    const expectedSuffix = new Date();
    expectedSuffix.setUTCDate(1);
    expectedSuffix.setUTCMonth(expectedSuffix.getUTCMonth() + 1);
    const yyyy = expectedSuffix.getUTCFullYear();
    const mm = String(expectedSuffix.getUTCMonth() + 1).padStart(2, '0');
    expect(rows[0]!.part_name).toBe(`audit_log_${yyyy}_${mm}`);
  });

  it('detach_old_partitions returns 0 when no partition is old enough', async () => {
    const { rows } = await ctx.testPool.query<{ detached: number }>(
      `SELECT audit_log_detach_old_partitions(10) AS detached`,
    );
    expect(rows[0]!.detached).toBe(0);
  });

  it('detach_old_partitions detaches partitions older than the retention window', async () => {
    // Create an ancient partition (year 2000, 10+ years before NOW()).
    await ctx.testPool.query(`SELECT audit_log_create_partition_for_month(2000, 1)`);

    const { rows: before } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM pg_inherits i
         JOIN pg_class c ON c.oid = i.inhrelid
         WHERE i.inhparent = 'audit_log'::regclass
           AND c.relname = 'audit_log_2000_01'`,
    );
    expect(before[0]!.count).toBe('1');

    const { rows } = await ctx.testPool.query<{ detached: number }>(
      `SELECT audit_log_detach_old_partitions(10) AS detached`,
    );
    expect(rows[0]!.detached).toBeGreaterThanOrEqual(1);

    const { rows: after } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM pg_inherits i
         JOIN pg_class c ON c.oid = i.inhrelid
         WHERE i.inhparent = 'audit_log'::regclass
           AND c.relname = 'audit_log_2000_01'`,
    );
    expect(after[0]!.count).toBe('0');

    // The detached partition survives as a regular table.
    const { rows: leftover } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM pg_class
         WHERE relname = 'audit_log_2000_01'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(leftover[0]!.count).toBe('1');
  });
});
