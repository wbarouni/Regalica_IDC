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

describeIfDb('migration 071 — seed severity_gap_relative_threshold', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(71);
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('inserts severity_gap_relative_threshold with the canonical numeric value 0.10', async () => {
    const { rows } = await ctx.testPool.query<{
      config_key: string;
      config_value: unknown;
      description: string;
    }>(
      `SELECT config_key, config_value, description
         FROM platform_config
        WHERE config_key = 'severity_gap_relative_threshold'`,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(typeof row.config_value).toBe('number');
    expect(row.config_value).toBe(0.1);
    expect(row.description).toMatch(/BLOQUANT|MAJEUR/);
  });

  it('is idempotent — re-applying the seed keeps a single row (ON CONFLICT DO NOTHING)', async () => {
    const sql = await readFile(join(MIGRATIONS_DIR, '071_seed_severity_threshold.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(sql);
    } finally {
      client.release();
    }
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM platform_config
        WHERE config_key = 'severity_gap_relative_threshold'`,
    );
    expect(rows[0]!.count).toBe('1');
  });
});
