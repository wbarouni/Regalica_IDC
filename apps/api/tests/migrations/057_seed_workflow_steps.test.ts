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

describeIfDb('migration 057 — seed_workflow_steps', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(56);
    const sql = await readFile(join(MIGRATIONS_DIR, '057_seed_workflow_steps.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(sql);
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('seeds 7 workflow_steps total (T0 + T1)', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workflow_steps`,
    );
    expect(rows[0]!.count).toBe('7');
  });

  it('seeds 3 T0 steps in canonical order', async () => {
    const { rows } = await ctx.testPool.query<{ agent_type: string; function_name: string }>(
      `SELECT agent_type, function_name
       FROM workflow_steps
       WHERE phase = 'T0'
       ORDER BY step_order`,
    );
    expect(rows).toEqual([
      { agent_type: 'ingestor_xml', function_name: 'parse_xml' },
      { agent_type: 'dependency', function_name: 'check_companions' },
      { agent_type: 'temporal', function_name: 'check_dates' },
    ]);
  });

  it('seeds 4 T1 steps in canonical order', async () => {
    const { rows } = await ctx.testPool.query<{ agent_type: string; function_name: string }>(
      `SELECT agent_type, function_name
       FROM workflow_steps
       WHERE phase = 'T1'
       ORDER BY step_order`,
    );
    expect(rows).toEqual([
      { agent_type: 'investigator', function_name: 'analyze_fail' },
      { agent_type: 'citation', function_name: 'find_regulatory_source' },
      { agent_type: 'historical', function_name: 'compare_runs_history' },
      { agent_type: 'reporter', function_name: 'generate_pdf' },
    ]);
  });

  it('every seeded step is active and not soft-deleted', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM workflow_steps
       WHERE is_active = FALSE OR deleted_at IS NOT NULL`,
    );
    expect(rows[0]!.count).toBe('0');
  });

  it('UNIQUE (phase, step_order) is enforced — duplicate insert raises', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO workflow_steps (phase, step_order, agent_type, function_name)
         VALUES ('T0', 1, 'ingestor_xml', 'parse_xml')`,
      ),
    ).rejects.toThrow();
  });

  it('is idempotent — re-applying the seed keeps the row count stable', async () => {
    const sql = await readFile(join(MIGRATIONS_DIR, '057_seed_workflow_steps.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(sql);
    } finally {
      client.release();
    }
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM workflow_steps`,
    );
    expect(rows[0]!.count).toBe('7');
  });
});
