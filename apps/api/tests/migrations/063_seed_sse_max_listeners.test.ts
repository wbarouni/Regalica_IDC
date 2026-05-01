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

describeIfDb('migration 063 — seed sse_max_listeners', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(63);
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('inserts sse_max_listeners with the canonical numeric value', async () => {
    const { rows } = await ctx.testPool.query<{
      config_key: string;
      config_value: unknown;
      description: string;
    }>(
      `SELECT config_key, config_value, description
         FROM platform_config
        WHERE config_key = 'sse_max_listeners'`,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(typeof row.config_value).toBe('number');
    expect(row.config_value).toBeGreaterThan(0);
    expect(row.description).toMatch(/EventEmitter|listener cap|runEventBus/);
  });

  it('is idempotent — re-applying the seed keeps a single row', async () => {
    const sql = await readFile(join(MIGRATIONS_DIR, '063_seed_sse_max_listeners.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(sql);
    } finally {
      client.release();
    }
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM platform_config WHERE config_key='sse_max_listeners'`,
    );
    expect(rows[0]!.count).toBe('1');
  });
});
