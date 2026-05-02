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

describeIfDb('migration 068 — seed regalica/planner platform_config tunables', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(68);
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('inserts regalica_planner_trigger_intents as a JSON string array', async () => {
    const { rows } = await ctx.testPool.query<{
      config_value: unknown;
      description: string;
    }>(
      `SELECT config_value, description
         FROM platform_config
        WHERE config_key = 'regalica_planner_trigger_intents'`,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(Array.isArray(row.config_value)).toBe(true);
    const value = row.config_value as unknown[];
    expect(value.length).toBeGreaterThan(0);
    for (const entry of value) {
      expect(typeof entry).toBe('string');
    }
    expect(row.description).toMatch(/planner|orchestrator|intent_grammar/i);
  });

  it('inserts regalica_planner_max_plan_steps as a positive integer', async () => {
    const { rows } = await ctx.testPool.query<{
      config_value: unknown;
      description: string;
    }>(
      `SELECT config_value, description
         FROM platform_config
        WHERE config_key = 'regalica_planner_max_plan_steps'`,
    );
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(typeof row.config_value).toBe('number');
    expect(row.config_value).toBeGreaterThanOrEqual(1);
    expect(row.description).toMatch(/planner|max_plan_steps|cap/i);
  });

  it('is idempotent — re-applying the seed keeps a single row per key', async () => {
    const sql = await readFile(
      join(MIGRATIONS_DIR, '068_seed_planner_trigger_intents.sql'),
      'utf8',
    );
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
        WHERE config_key IN
          ('regalica_planner_trigger_intents', 'regalica_planner_max_plan_steps')`,
    );
    expect(rows[0]!.count).toBe('2');
  });
});
