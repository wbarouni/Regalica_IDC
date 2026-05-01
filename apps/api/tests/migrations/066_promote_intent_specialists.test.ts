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

describeIfDb('migration 066 — promote intent_specialists + bearers (4-yeux)', () => {
  let ctx: MigrationsTestContext;
  let authorId: string;
  let validatorId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(64);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-066', 'Legal Test 066') RETURNING id`,
    );
    const tenantId = t.rows[0]!.id;
    const author = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-066-author', 'author-066@tenant-001.example', 'Author 066')
         RETURNING id`,
      [tenantId],
    );
    authorId = author.rows[0]!.id;
    const validator = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-066-validator', 'validator-066@tenant-001.example', 'Validator 066')
         RETURNING id`,
      [tenantId],
    );
    validatorId = validator.rows[0]!.id;

    const seed065 = await readFile(join(MIGRATIONS_DIR, '065_seed_intent_specialists.sql'), 'utf8');
    const promote066 = await readFile(
      join(MIGRATIONS_DIR, '066_promote_intent_specialists.sql'),
      'utf8',
    );
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_validator_user_id = '${validatorId}'`);
      await client.query(seed065);
      await client.query(promote066);
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('promotes the 10 intent_specialists rows from draft to active', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM intent_specialists
        WHERE status='active' AND validator_user_id IS NOT NULL AND validated_at IS NOT NULL`,
    );
    expect(rows[0]!.count).toBe('10');
  });

  it('promotes the 3 intent_specialist_bearers rows from draft to active', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM intent_specialist_bearers
        WHERE status='active' AND validator_user_id IS NOT NULL AND validated_at IS NOT NULL`,
    );
    expect(rows[0]!.count).toBe('3');
  });

  it('every promoted row carries validator distinct from author', async () => {
    const { rows } = await ctx.testPool.query<{
      mismatched: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM intent_specialists
            WHERE status='active' AND author_user_id = validator_user_id)
       AS mismatched`,
    );
    expect(rows[0]!.mismatched).toBe('0');
  });

  it('v_intent_specialists_active surfaces the 10 promoted rows in ordinal order', async () => {
    const { rows } = await ctx.testPool.query<{ intent_type: string; ordinal: number }>(
      `SELECT intent_type, ordinal FROM v_intent_specialists_active ORDER BY ordinal`,
    );
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.intent_type)).toEqual([
      'zoom',
      'cluster',
      'historical',
      'citation',
      'simulation',
      'sanction',
      'plan',
      'general_help',
      'out_of_scope',
      'ambiguous',
    ]);
  });

  it('v_intent_specialist_bearers_active surfaces the 3 promoted bearers', async () => {
    const { rows } = await ctx.testPool.query<{ specialist_id: string }>(
      `SELECT specialist_id FROM v_intent_specialist_bearers_active ORDER BY specialist_id`,
    );
    expect(rows.map((r) => r.specialist_id)).toEqual(['citation', 'historical', 'investigator']);
  });

  it('is idempotent — re-applying mutates no rows', async () => {
    const promote066 = await readFile(
      join(MIGRATIONS_DIR, '066_promote_intent_specialists.sql'),
      'utf8',
    );
    const before = await ctx.testPool.query<{ updated_at: Date }>(
      `SELECT MIN(updated_at) AS updated_at FROM intent_specialists`,
    );
    const beforeAt = before.rows[0]!.updated_at;

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_validator_user_id = '${validatorId}'`);
      await client.query(promote066);
    } finally {
      client.release();
    }
    const after = await ctx.testPool.query<{ updated_at: Date }>(
      `SELECT MIN(updated_at) AS updated_at FROM intent_specialists`,
    );
    expect(after.rows[0]!.updated_at.toISOString()).toBe(beforeAt.toISOString());
  });

  it('rejects a promotion where author equals validator', async () => {
    const promote066 = await readFile(
      join(MIGRATIONS_DIR, '066_promote_intent_specialists.sql'),
      'utf8',
    );
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_validator_user_id = '${authorId}'`);
      await expect(client.query(promote066)).rejects.toThrow(/4-yeux/);
    } finally {
      client.release();
    }
  });
});
