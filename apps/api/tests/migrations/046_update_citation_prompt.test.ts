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

describeIfDb('migration 046 — update_citation_prompt', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  beforeAll(async () => {
    // Stop at 042: 043 + 046 are applied manually below with the seed
    // session vars set, so they actually mutate prompt_bank (the
    // in-loop application would skip both via missing-ok guards).
    // 044 and 045 are intentionally NOT applied here — this test
    // isolates the 046 update against the post-043 state, so the
    // count of remaining placeholders is deterministic.
    ctx = await setupMigrationsSchema(42);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-046', 'Legal Test 046') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-046-author', 'author-046@tenant-001.example', 'Author 046')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'platform_owner'`,
      [tenantId],
    );
    const platformOwnerRoleId = roleRows[0]!.id;
    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, authorId, platformOwnerRoleId],
    );

    const seed043 = await readFile(join(MIGRATIONS_DIR, '043_seed_prompt_bank.sql'), 'utf8');
    const update046 = await readFile(
      join(MIGRATIONS_DIR, '046_update_citation_prompt.sql'),
      'utf8',
    );

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_valid_from = '2025-01-01'`);
      await client.query(seed043);
      await client.query(update046);
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('replaces the placeholder template with the real prompt', async () => {
    const { rows } = await ctx.testPool.query<{ template: string }>(
      `SELECT template FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'citation'
           AND function_name = 'find_regulatory_source'
           AND version = 1`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    const template = rows[0]!.template;
    expect(template).not.toContain('[CITATION_FIND_REGULATORY_SOURCE_V1]');
    expect(template).toContain('{rule_data}');
    expect(template).toContain('circulaire');
    expect(template).toContain('reference_complete');
  });

  it('declares the structured JSON output keys expected by the agent', async () => {
    const { rows } = await ctx.testPool.query<{ template: string }>(
      `SELECT template FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'citation'
           AND function_name = 'find_regulatory_source'
           AND version = 1`,
      [tenantId],
    );
    const template = rows[0]!.template;
    const outputKeys = [
      'circulaire',
      'article',
      'paragraphe',
      'reference_complete',
      'texte_pertinent',
      'confidence',
      'justification',
    ];
    for (const k of outputKeys) {
      expect(template).toContain(k);
    }
  });

  it('keeps the runtime parameters unchanged (temperature 0.3, no thinking)', async () => {
    const { rows } = await ctx.testPool.query<{
      temperature: string;
      thinking_enabled: boolean;
      max_tokens: number;
      target_model: string;
    }>(
      `SELECT temperature::text AS temperature,
              thinking_enabled,
              max_tokens,
              target_model
         FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'citation'
           AND function_name = 'find_regulatory_source'
           AND version = 1`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.temperature)).toBe(0.3);
    expect(rows[0]!.thinking_enabled).toBe(false);
    expect(rows[0]!.max_tokens).toBe(2048);
    expect(rows[0]!.target_model).toBe('gemini-2.5-flash');
  });

  it('keeps the row in draft status (4-eyes promotion still required)', async () => {
    const { rows } = await ctx.testPool.query<{ status: string }>(
      `SELECT status FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'citation'
           AND function_name = 'find_regulatory_source'
           AND version = 1`,
      [tenantId],
    );
    expect(rows[0]!.status).toBe('draft');
  });

  it('does not modify any other prompt_bank row', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
         WHERE tenant_id = $1
           AND template LIKE '[%_V1]'`,
      [tenantId],
    );
    // 22 seeded - 1 citation updated = 21 remaining placeholders.
    expect(rows[0]!.count).toBe('21');
  });
});
