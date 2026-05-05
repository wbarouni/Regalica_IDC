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
 * Migration 078 — seed `self_introduction` intent + Regalica static
 * aggregator. Three blocks (mirrors the 076 download_report pattern):
 *   078-A : INSERT intent_specialists row (specialist_ids=[])
 *           — conditional on app.seed_author_user_id.
 *   078-C : INSERT prompt_bank row with non-empty static_response
 *           — conditional on app.seed_tenant_id + app.seed_author_user_id
 *           + app.seed_valid_from.
 *   078-B : promote draft → active — conditional on author + validator.
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
       VALUES ($1, 'sso-078-author', 'author-078@tenant-001.example', 'Author 078')
       RETURNING id`,
    [tenantId],
  );
  const authorId = author.rows[0]!.id;

  const validator = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
       VALUES ($1, 'sso-078-validator', 'val-078@tenant-001.example', 'Val 078')
       RETURNING id`,
    [tenantId],
  );
  const validatorId = validator.rows[0]!.id;

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

async function apply078(
  ctx: MigrationsTestContext,
  options: {
    author?: string;
    validator?: string;
    tenantId?: string;
    validFrom?: string;
  } = {},
): Promise<void> {
  const sql = await readFile(join(MIGRATIONS_DIR, '078_seed_intent_self_introduction.sql'), 'utf8');
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

describeIfDb('migration 078 — seed self_introduction intent + static aggregator', () => {
  describe('078-A — seed intent (conditional on author GUC)', () => {
    it('skips when GUC is absent (no row inserted)', async () => {
      const ctx = await setupMigrationsSchema(77);
      try {
        await apply078(ctx, {});
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM intent_specialists
             WHERE intent_type = 'self_introduction'`,
        );
        expect(rows[0]!.count).toBe('0');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('inserts the intent row with empty specialist_ids when author GUC is set', async () => {
      const ctx = await setupMigrationsSchema(77);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-078-a');
        await apply078(ctx, { author: ids.authorId });

        const { rows } = await ctx.testPool.query<{
          aggregator_agent_type: string;
          aggregator_function_name: string;
          status: string;
          specialist_ids: unknown;
        }>(
          `SELECT aggregator_agent_type, aggregator_function_name,
                  status, specialist_ids
             FROM intent_specialists WHERE intent_type = 'self_introduction'`,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.aggregator_agent_type).toBe('regalica');
        expect(rows[0]!.aggregator_function_name).toBe('aggregate_self_introduction');
        expect(rows[0]!.status).toBe('draft');
        // No specialist bearer for self-introduction: aggregator is the
        // single voice, fed by static_response.
        expect(JSON.stringify(rows[0]!.specialist_ids)).toBe('[]');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('is idempotent — second apply keeps a single row', async () => {
      const ctx = await setupMigrationsSchema(77);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-078-a-idem');
        await apply078(ctx, { author: ids.authorId });
        await apply078(ctx, { author: ids.authorId });
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM intent_specialists
             WHERE intent_type = 'self_introduction'`,
        );
        expect(rows[0]!.count).toBe('1');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);
  });

  describe('078-C — prompt seed with static_response', () => {
    it('skips when prompt-seed GUC trio is absent', async () => {
      const ctx = await setupMigrationsSchema(77);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-078-c1');
        await apply078(ctx, { author: ids.authorId });
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM prompt_bank
             WHERE tenant_id = $1 AND agent_type = 'regalica'
               AND function_name = 'aggregate_self_introduction'`,
          [ids.tenantId],
        );
        expect(rows[0]!.count).toBe('0');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('inserts the prompt with non-empty static_response when GUC trio is set', async () => {
      const ctx = await setupMigrationsSchema(77);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-078-c2');
        await apply078(ctx, {
          author: ids.authorId,
          tenantId: ids.tenantId,
          validFrom: '2025-01-01',
        });
        const { rows } = await ctx.testPool.query<{
          status: string;
          output_contract: string;
          static_response: string;
        }>(
          `SELECT status, output_contract, static_response
             FROM prompt_bank
            WHERE tenant_id = $1 AND agent_type = 'regalica'
              AND function_name = 'aggregate_self_introduction'`,
          [ids.tenantId],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.status).toBe('draft');
        expect(rows[0]!.output_contract).toBe('string');
        // The static_response markdown must contain Regalica's name +
        // the REGFlow product anchor + the BCT acronym so the user
        // immediately gets the canonical identity statement.
        expect(rows[0]!.static_response).toContain('Regalica');
        expect(rows[0]!.static_response).toContain('REGFlow');
        expect(rows[0]!.static_response).toContain('BCT');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);
  });

  describe('078-B — promote (conditional on author + validator GUCs)', () => {
    it('raises 4-eyes violation when author == validator', async () => {
      const ctx = await setupMigrationsSchema(77);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-078-b1');
        await apply078(ctx, { author: ids.authorId });
        await expect(
          apply078(ctx, { author: ids.authorId, validator: ids.authorId }),
        ).rejects.toThrow(/4-eyes violation/);
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('promotes intent + prompt to active when validator differs', async () => {
      const ctx = await setupMigrationsSchema(77);
      try {
        const ids = await seedTenantAuthorValidator(ctx, 'tenant-test-078-b2');
        // First pass — seed intent + prompt (still draft).
        await apply078(ctx, {
          author: ids.authorId,
          tenantId: ids.tenantId,
          validFrom: '2025-01-01',
        });
        // Second pass — promote with validator GUC.
        await apply078(ctx, {
          author: ids.authorId,
          validator: ids.validatorId,
          tenantId: ids.tenantId,
          validFrom: '2025-01-01',
        });

        const { rows: intent } = await ctx.testPool.query<{
          status: string;
          validator_user_id: string;
        }>(
          `SELECT status, validator_user_id FROM intent_specialists
             WHERE intent_type = 'self_introduction'`,
        );
        expect(intent[0]!.status).toBe('active');
        expect(intent[0]!.validator_user_id).toBe(ids.validatorId);

        const { rows: prompt } = await ctx.testPool.query<{
          status: string;
          validator_user_id: string;
        }>(
          `SELECT status, validator_user_id FROM prompt_bank
             WHERE tenant_id = $1 AND agent_type = 'regalica'
               AND function_name = 'aggregate_self_introduction'`,
          [ids.tenantId],
        );
        expect(prompt[0]!.status).toBe('active');
        expect(prompt[0]!.validator_user_id).toBe(ids.validatorId);
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);
  });
});
