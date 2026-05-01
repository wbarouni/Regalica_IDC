import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const MIGRATIONS_DIR = resolve(__dirname, '../../migrations');

describeIfDb('migration 062 — seed temporal_arrete_calendar', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(62);
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('inserts the temporal_arrete_calendar key with the canonical shape', async () => {
    const { rows } = await ctx.testPool.query<{
      config_key: string;
      config_value: unknown;
      description: string;
    }>(
      `SELECT config_key, config_value, description
         FROM platform_config
        WHERE config_key = 'temporal_arrete_calendar'`,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    const value = row.config_value as {
      quarterly_end_months: number[];
      annual_month: number;
      annual_day: number;
    };
    expect(value.quarterly_end_months).toEqual([3, 6, 9, 12]);
    expect(value.annual_month).toBe(12);
    expect(value.annual_day).toBe(31);
    expect(row.description).toMatch(/TemporalAgent|t0_temporal/);
  });

  it('is idempotent — re-applying the seed updates updated_at and keeps a single row', async () => {
    const sql = await readFile(
      join(MIGRATIONS_DIR, '062_seed_temporal_arrete_calendar.sql'),
      'utf8',
    );
    const beforeCount = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM platform_config WHERE config_key='temporal_arrete_calendar'`,
    );
    expect(beforeCount.rows[0]!.count).toBe('1');

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(sql);
    } finally {
      client.release();
    }

    const afterCount = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM platform_config WHERE config_key='temporal_arrete_calendar'`,
    );
    expect(afterCount.rows[0]!.count).toBe('1');
  });
});
