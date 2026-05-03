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

/**
 * Migration 072 — seed launch_validation intent + t1_runner bearer.
 *
 * Two blocks:
 *   072-A : INSERT (idempotent) — conditional on app.seed_author_user_id.
 *   072-B : promote draft → active — conditional on author + validator GUCs.
 *
 * Each test re-applies 072 with the GUC combination it wants to exercise.
 */

interface SeedIds {
  tenantId: string;
  authorId: string;
  validatorId: string;
}

async function seedTenantAuthorValidator(
  ctx: MigrationsTestContext,
  slug: string,
): Promise<SeedIds> {
  const tenant = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO tenants (slug, legal_name)
       VALUES ($1, $2) RETURNING id`,
    [slug, `Legal ${slug}`],
  );
  const tenantId = tenant.rows[0]!.id;

  const author = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
       VALUES ($1, 'sso-072-author', 'author-072@tenant-001.example', 'Author 072')
       RETURNING id`,
    [tenantId],
  );
  const authorId = author.rows[0]!.id;

  const validator = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
       VALUES ($1, 'sso-072-validator', 'val-072@tenant-001.example', 'Val 072')
       RETURNING id`,
    [tenantId],
  );
  const validatorId = validator.rows[0]!.id;

  // Both author and validator need platform_owner so the seed inserts
  // and the promotion UPDATE pass any RLS gate that may exist on the
  // intent_specialist tables (064 leaves them open SELECT but writes
  // are inhabit-only — author/validator are FK constraints anyway).
  const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
    `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'platform_owner'`,
    [tenantId],
  );
  const platformOwnerRoleId = roleRows[0]!.id;
  await ctx.testPool.query(
    `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
    [tenantId, authorId, platformOwnerRoleId],
  );
  await ctx.testPool.query(
    `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
    [tenantId, validatorId, platformOwnerRoleId],
  );

  return { tenantId, authorId, validatorId };
}

async function apply072(
  ctx: MigrationsTestContext,
  options: {
    author?: string;
    validator?: string;
    tenantId?: string;
    validFrom?: string;
  } = {},
): Promise<void> {
  const sql = await readFile(join(MIGRATIONS_DIR, '072_seed_intent_launch_validation.sql'), 'utf8');
  const client = await ctx.testPool.connect();
  try {
    await client.query(`SET search_path TO ${ctx.schemaName}, public`);
    if (options.author !== undefined) {
      await client.query(`SET app.seed_author_user_id = '${options.author}'`);
    }
    if (options.validator !== undefined) {
      await client.query(`SET app.seed_validator_user_id = '${options.validator}'`);
    }
    if (options.tenantId !== undefined) {
      await client.query(`SET app.seed_tenant_id = '${options.tenantId}'`);
    }
    if (options.validFrom !== undefined) {
      await client.query(`SET app.seed_valid_from = '${options.validFrom}'`);
    }
    await client.query(sql);
  } finally {
    client.release();
  }
}

describeIfDb('migration 072 — seed launch_validation intent + t1_runner bearer', () => {
  describe('072-A — seed (conditional on author GUC)', () => {
    it('skips when GUC is absent (no row inserted)', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        await apply072(ctx, {});
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM intent_specialists
             WHERE intent_type = 'launch_validation'`,
        );
        expect(rows[0]!.count).toBe('0');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('inserts the intent row + bearer row when author GUC is set', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-072-a');
        await apply072(ctx, { author: ids.authorId });

        const { rows: intentRows } = await ctx.testPool.query<{
          aggregator_agent_type: string;
          aggregator_function_name: string;
          status: string;
          specialist_ids: unknown;
        }>(
          `SELECT aggregator_agent_type, aggregator_function_name,
                  status, specialist_ids
             FROM intent_specialists WHERE intent_type = 'launch_validation'`,
        );
        expect(intentRows).toHaveLength(1);
        expect(intentRows[0]!.aggregator_agent_type).toBe('regalica');
        expect(intentRows[0]!.aggregator_function_name).toBe('aggregate_t1_result');
        expect(intentRows[0]!.status).toBe('draft');
        expect(JSON.stringify(intentRows[0]!.specialist_ids)).toContain('t1_runner');

        const { rows: bearerRows } = await ctx.testPool.query<{
          agent_type: string;
          function_name: string;
          status: string;
        }>(
          `SELECT agent_type, function_name, status
             FROM intent_specialist_bearers WHERE specialist_id = 't1_runner'`,
        );
        expect(bearerRows).toHaveLength(1);
        expect(bearerRows[0]!.agent_type).toBe('regalica');
        expect(bearerRows[0]!.function_name).toBe('aggregate_t1_result');
        expect(bearerRows[0]!.status).toBe('draft');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('is idempotent — second apply keeps a single row', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-072-a-idem');
        await apply072(ctx, { author: ids.authorId });
        await apply072(ctx, { author: ids.authorId });
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM intent_specialists
             WHERE intent_type = 'launch_validation'`,
        );
        expect(rows[0]!.count).toBe('1');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);
  });

  describe('072-B — promote (conditional on author + validator GUCs)', () => {
    it('skips when GUCs are absent (intent stays in draft)', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-072-b1');
        // Apply 072-A then 072-B-skip in two steps via 2 calls.
        await apply072(ctx, { author: ids.authorId });
        await apply072(ctx, {});
        const { rows } = await ctx.testPool.query<{ status: string }>(
          `SELECT status FROM intent_specialists WHERE intent_type = 'launch_validation'`,
        );
        expect(rows[0]!.status).toBe('draft');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('raises 4-eyes violation when author == validator', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-072-b2');
        await apply072(ctx, { author: ids.authorId });
        await expect(
          apply072(ctx, { author: ids.authorId, validator: ids.authorId }),
        ).rejects.toThrow(/4-eyes violation/);
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('promotes intent + bearer to active when validator differs', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-072-b3');
        await apply072(ctx, { author: ids.authorId });
        await apply072(ctx, { author: ids.authorId, validator: ids.validatorId });

        const { rows: intent } = await ctx.testPool.query<{
          status: string;
          validator_user_id: string;
        }>(
          `SELECT status, validator_user_id FROM intent_specialists
             WHERE intent_type = 'launch_validation'`,
        );
        expect(intent[0]!.status).toBe('active');
        expect(intent[0]!.validator_user_id).toBe(ids.validatorId);

        const { rows: bearer } = await ctx.testPool.query<{
          status: string;
          validator_user_id: string;
        }>(
          `SELECT status, validator_user_id FROM intent_specialist_bearers
             WHERE specialist_id = 't1_runner'`,
        );
        expect(bearer[0]!.status).toBe('active');
        expect(bearer[0]!.validator_user_id).toBe(ids.validatorId);
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);
  });

  describe('072-C — prompt seed (conditional on tenant + author + valid_from GUCs)', () => {
    it('skips when prompt-seed GUC trio is absent', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-072-c1');
        // 072-A runs (author only) but 072-C should skip.
        await apply072(ctx, { author: ids.authorId });
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM prompt_bank
             WHERE tenant_id = $1 AND agent_type = 'regalica'
               AND function_name = 'aggregate_t1_result'`,
          [ids.tenantId],
        );
        expect(rows[0]!.count).toBe('0');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('inserts the prompt in draft when GUC trio is set', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-072-c2');
        await apply072(ctx, {
          author: ids.authorId,
          tenantId: ids.tenantId,
          validFrom: '2025-01-01',
        });
        const { rows } = await ctx.testPool.query<{
          status: string;
          output_contract: string;
          temperature: string;
          max_tokens: number;
        }>(
          `SELECT status, output_contract, temperature::text AS temperature,
                  max_tokens
             FROM prompt_bank
            WHERE tenant_id = $1 AND agent_type = 'regalica'
              AND function_name = 'aggregate_t1_result'`,
          [ids.tenantId],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.status).toBe('draft');
        expect(rows[0]!.output_contract).toBe('string');
        expect(parseFloat(rows[0]!.temperature)).toBe(0.3);
        expect(rows[0]!.max_tokens).toBe(512);
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('promotes the prompt to active when 072-B runs with validator', async () => {
      const ctx = await setupMigrationsSchema(71);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-072-c3');
        // First call seeds intent + bearer (072-A) AND prompt (072-C);
        // 072-B skips because validator GUC is absent.
        await apply072(ctx, {
          author: ids.authorId,
          tenantId: ids.tenantId,
          validFrom: '2025-01-01',
        });
        // Second call promotes everything (072-B fires).
        await apply072(ctx, {
          author: ids.authorId,
          validator: ids.validatorId,
          tenantId: ids.tenantId,
          validFrom: '2025-01-01',
        });
        const { rows } = await ctx.testPool.query<{
          status: string;
          validator_user_id: string;
        }>(
          `SELECT status, validator_user_id FROM prompt_bank
             WHERE tenant_id = $1 AND agent_type = 'regalica'
               AND function_name = 'aggregate_t1_result'`,
          [ids.tenantId],
        );
        expect(rows[0]!.status).toBe('active');
        expect(rows[0]!.validator_user_id).toBe(ids.validatorId);
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);
  });
});
