/**
 * Integration tests for migration 113_intent_specialists_requires_active_run.sql
 * + migration 115_intent_specialists_view_requires_active_run.sql.
 *
 * Conditional: skipped when DATABASE_URL is unset (matches the pattern
 * established by 026_validation_fail_details.test.ts / 107_rubrique_confidence.test.ts).
 *
 * Coverage:
 *   - Column requires_active_run exists with default FALSE (NOT NULL).
 *   - With operator GUCs set + dev tenant bootstrapped (037a), the 113-B
 *     UPDATE flips zoom/cluster/historical/plan rows to TRUE.
 *   - The other 6 intents (citation, simulation, sanction, general_help,
 *     out_of_scope, ambiguous, launch_validation, download_report,
 *     self_introduction) stay at FALSE.
 *   - The view v_intent_specialists_active exposes the new column.
 *   - Idempotence: re-applying migration 113 does not flip extra rows.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

// Mirror the deterministic UUIDs defined by migration 037a so the
// SEED_* GUCs match the bootstrapped users.
const TENANT_ID = 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7';
const AUTHOR_ID = '2cb0ce35-4b43-499f-b23a-722ef86902ce';
const VALIDATOR_ID = 'ef810369-1e96-485d-bf1d-dc8937e32bb9';
const VALID_FROM = '2026-05-11T00:00:00Z';

const INTENTS_REQUIRING_RUN = ['zoom', 'cluster', 'historical', 'plan'] as const;

describeIfDb('migration 113/115 — intent_specialists.requires_active_run', () => {
  let ctx: MigrationsTestContext;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(115, {
      sessionVars: {
        'app.seed_dev_tenant': 'true',
        'app.seed_tenant_id': TENANT_ID,
        'app.seed_author_user_id': AUTHOR_ID,
        'app.seed_validator_user_id': VALIDATOR_ID,
        'app.seed_valid_from': VALID_FROM,
      },
    });
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('adds requires_active_run column with NOT NULL DEFAULT FALSE', async () => {
    const { rows } = await ctx.testPool.query<{
      column_default: string | null;
      is_nullable: 'YES' | 'NO';
      data_type: string;
    }>(
      `SELECT column_default, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'intent_specialists'
          AND column_name = 'requires_active_run'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data_type).toBe('boolean');
    expect(rows[0]?.is_nullable).toBe('NO');
    expect(rows[0]?.column_default).toBe('false');
  });

  it('flips zoom/cluster/historical/plan to TRUE on active rows', async () => {
    const { rows } = await ctx.testPool.query<{
      intent_type: string;
      requires_active_run: boolean;
    }>(
      `SELECT intent_type, requires_active_run
         FROM intent_specialists
        WHERE intent_type = ANY($1::text[])
          AND status = 'active'
          AND deleted_at IS NULL
        ORDER BY intent_type`,
      [INTENTS_REQUIRING_RUN],
    );
    expect(rows.map((r) => r.intent_type)).toEqual([...INTENTS_REQUIRING_RUN].sort());
    for (const row of rows) {
      expect(row.requires_active_run).toBe(true);
    }
  });

  it('keeps every other intent at requires_active_run = FALSE', async () => {
    const { rows } = await ctx.testPool.query<{
      intent_type: string;
      requires_active_run: boolean;
    }>(
      `SELECT intent_type, requires_active_run
         FROM intent_specialists
        WHERE intent_type <> ALL($1::text[])
          AND status = 'active'
          AND deleted_at IS NULL`,
      [INTENTS_REQUIRING_RUN],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.requires_active_run).toBe(false);
    }
  });

  it('exposes requires_active_run through v_intent_specialists_active', async () => {
    const { rows } = await ctx.testPool.query<{
      intent_type: string;
      requires_active_run: boolean;
    }>(
      `SELECT intent_type, requires_active_run
         FROM v_intent_specialists_active
        ORDER BY ordinal`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const flipped = rows.filter((r) => r.requires_active_run);
    expect(flipped.map((r) => r.intent_type).sort()).toEqual([...INTENTS_REQUIRING_RUN].sort());
  });

  it('is idempotent — re-applying migration 113 does not flip new rows', async () => {
    const sqlPath = resolve(
      __dirname,
      '../../migrations/113_intent_specialists_requires_active_run.sql',
    );
    const sql = await readFile(sqlPath, 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${TENANT_ID}'`);
      await client.query(sql);
    } finally {
      client.release();
    }
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM intent_specialists
        WHERE requires_active_run = TRUE
          AND status = 'active'
          AND deleted_at IS NULL`,
    );
    expect(rows[0]?.count).toBe(String(INTENTS_REQUIRING_RUN.length));
  });
});
