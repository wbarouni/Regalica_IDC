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

describeIfDb('migration 065 — seed intent_specialists + bearers (draft)', () => {
  let ctx: MigrationsTestContext;
  let authorId: string;

  beforeAll(async () => {
    // Stop at 064 so 065 is applied manually below with the seed GUC
    // set, mirroring 058's pattern.
    ctx = await setupMigrationsSchema(64);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-065', 'Legal Test 065') RETURNING id`,
    );
    const tenantId = t.rows[0]!.id;
    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-065-author', 'author-065@tenant-001.example', 'Author 065')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    const sql = await readFile(join(MIGRATIONS_DIR, '065_seed_intent_specialists.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(sql);
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('seeds exactly 10 intent_specialists rows in status=draft', async () => {
    const { rows } = await ctx.testPool.query<{
      count: string;
      drafts: string;
    }>(
      `SELECT COUNT(*)::text AS count,
              COUNT(*) FILTER (WHERE status='draft')::text AS drafts
         FROM intent_specialists`,
    );
    expect(rows[0]!.count).toBe('10');
    expect(rows[0]!.drafts).toBe('10');
  });

  it('seeds the 7 user-facing intents in question_types fn_name order', async () => {
    const { rows } = await ctx.testPool.query<{ intent_type: string }>(
      `SELECT intent_type FROM intent_specialists
        WHERE ordinal BETWEEN 1 AND 7 ORDER BY ordinal`,
    );
    expect(rows.map((r) => r.intent_type)).toEqual([
      'zoom',
      'cluster',
      'historical',
      'citation',
      'simulation',
      'sanction',
      'plan',
    ]);
  });

  it('seeds the 3 ambient intents (general_help, out_of_scope, ambiguous)', async () => {
    const { rows } = await ctx.testPool.query<{ intent_type: string; ordinal: number }>(
      `SELECT intent_type, ordinal FROM intent_specialists
        WHERE ordinal BETWEEN 8 AND 10 ORDER BY ordinal`,
    );
    expect(rows.map((r) => r.intent_type)).toEqual(['general_help', 'out_of_scope', 'ambiguous']);
  });

  it('every aggregator (agent_type, function_name) tuple is the regalica/aggregate_* convention', async () => {
    const { rows } = await ctx.testPool.query<{
      aggregator_agent_type: string;
      aggregator_function_name: string;
    }>(`SELECT aggregator_agent_type, aggregator_function_name FROM intent_specialists`);
    for (const r of rows) {
      expect(r.aggregator_agent_type).toBe('regalica');
      expect(r.aggregator_function_name).toMatch(/^aggregate_/);
    }
  });

  it('zoom intent invokes both investigator and citation specialists in that order', async () => {
    const { rows } = await ctx.testPool.query<{ specialist_ids: unknown }>(
      `SELECT specialist_ids FROM intent_specialists WHERE intent_type='zoom'`,
    );
    expect(rows[0]!.specialist_ids).toEqual(['investigator', 'citation']);
  });

  it('seeds exactly 3 intent_specialist_bearers rows in status=draft', async () => {
    const { rows } = await ctx.testPool.query<{
      count: string;
      drafts: string;
    }>(
      `SELECT COUNT(*)::text AS count,
              COUNT(*) FILTER (WHERE status='draft')::text AS drafts
         FROM intent_specialist_bearers`,
    );
    expect(rows[0]!.count).toBe('3');
    expect(rows[0]!.drafts).toBe('3');
  });

  it('bearer agents map specialist_id -> the canonical (agent_type, function_name) tuples', async () => {
    const { rows } = await ctx.testPool.query<{
      specialist_id: string;
      agent_type: string;
      function_name: string;
    }>(
      `SELECT specialist_id, agent_type, function_name
         FROM intent_specialist_bearers ORDER BY specialist_id`,
    );
    expect(rows).toEqual([
      {
        specialist_id: 'citation',
        agent_type: 'citation',
        function_name: 'find_regulatory_source',
      },
      {
        specialist_id: 'historical',
        agent_type: 'historical',
        function_name: 'compare_runs_history',
      },
      {
        specialist_id: 'investigator',
        agent_type: 'investigator',
        function_name: 'analyze_fail',
      },
    ]);
  });

  it('every specialist_id referenced in intent_specialists.specialist_ids is declared in bearers', async () => {
    const { rows } = await ctx.testPool.query<{ specialist_id: string }>(
      `SELECT DISTINCT jsonb_array_elements_text(specialist_ids) AS specialist_id
         FROM intent_specialists
        WHERE jsonb_array_length(specialist_ids) > 0
        ORDER BY 1`,
    );
    const referenced = rows.map((r) => r.specialist_id);
    const { rows: bearers } = await ctx.testPool.query<{ specialist_id: string }>(
      `SELECT specialist_id FROM intent_specialist_bearers ORDER BY specialist_id`,
    );
    const declared = new Set(bearers.map((r) => r.specialist_id));
    for (const id of referenced) {
      expect(declared.has(id)).toBe(true);
    }
  });

  it('is idempotent — re-applying the seed inserts no duplicates', async () => {
    const sql = await readFile(join(MIGRATIONS_DIR, '065_seed_intent_specialists.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(sql);
    } finally {
      client.release();
    }
    const { rows } = await ctx.testPool.query<{ intents: string; bearers: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM intent_specialists)        AS intents,
         (SELECT COUNT(*)::text FROM intent_specialist_bearers) AS bearers`,
    );
    expect(rows[0]!.intents).toBe('10');
    expect(rows[0]!.bearers).toBe('3');
  });
});
