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
 * Migration 070 — promote v1 prompts + static_response + model_tier columns.
 *
 * 8 contract tests organised in 3 buckets:
 *   070-A : DDL (columns + check constraint) — runs unconditionally
 *   070-B : promotion draft → active — conditional on GUCs
 *   070-C : static_response backfill — runs unconditionally
 *
 * Each test sets up a fresh isolated schema then drives 043 + 070 with
 * the GUC combination it wants to exercise. Setup applies migrations
 * 001-069 via setupMigrationsSchema then runs 043 manually with the
 * GUCs set on the client (043 self-skips when GUCs are absent).
 */

interface SeedContext {
  ctx: MigrationsTestContext;
  tenantId: string;
  authorId: string;
  validatorId: string;
}

async function seedTenantWithAuthorAndValidator(
  ctx: MigrationsTestContext,
  slug: string,
): Promise<{ tenantId: string; authorId: string; validatorId: string }> {
  const t = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO tenants (slug, legal_name)
       VALUES ($1, $2) RETURNING id`,
    [slug, `Legal ${slug}`],
  );
  const tenantId = t.rows[0]!.id;

  const author = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
       VALUES ($1, 'sso-070-author', 'author-070@tenant-001.example', 'Author 070')
       RETURNING id`,
    [tenantId],
  );
  const authorId = author.rows[0]!.id;

  const validator = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
       VALUES ($1, 'sso-070-validator', 'validator-070@tenant-001.example', 'Validator 070')
       RETURNING id`,
    [tenantId],
  );
  const validatorId = validator.rows[0]!.id;

  // Both author and validator need platform_owner so the prompt_bank RLS
  // policies (gated on current_user_has_role('platform_owner')) accept
  // the seed inserts AND the promotion UPDATE.
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

async function applySeed043(seed: SeedContext): Promise<void> {
  const sql = await readFile(join(MIGRATIONS_DIR, '043_seed_prompt_bank.sql'), 'utf8');
  const client = await seed.ctx.testPool.connect();
  try {
    await client.query(`SET search_path TO ${seed.ctx.schemaName}, public`);
    await client.query(`SET app.seed_tenant_id = '${seed.tenantId}'`);
    await client.query(`SET app.seed_author_user_id = '${seed.authorId}'`);
    await client.query(`SET app.seed_valid_from = '2025-01-01'`);
    await client.query(sql);
  } finally {
    client.release();
  }
}

async function apply070(
  seed: SeedContext,
  options: { withGucs: boolean; selfValidator?: boolean } = { withGucs: false },
): Promise<void> {
  const sql = await readFile(
    join(MIGRATIONS_DIR, '070_promote_prompts_v1_and_static_response.sql'),
    'utf8',
  );
  const client = await seed.ctx.testPool.connect();
  try {
    await client.query(`SET search_path TO ${seed.ctx.schemaName}, public`);
    if (options.withGucs) {
      await client.query(`SET app.seed_author_user_id = '${seed.authorId}'`);
      const validatorUuid = options.selfValidator ? seed.authorId : seed.validatorId;
      await client.query(`SET app.seed_validator_user_id = '${validatorUuid}'`);
    }
    await client.query(sql);
  } finally {
    client.release();
  }
}

describeIfDb('migration 070 — promote prompts + static_response + model_tier', () => {
  describe('070-A — DDL (runs unconditionally)', () => {
    let ctx: MigrationsTestContext;
    let seed: SeedContext;

    beforeAll(async () => {
      ctx = await setupMigrationsSchema(69);
      const ids = await seedTenantWithAuthorAndValidator(ctx, 'tenant-test-070-a');
      seed = { ctx, ...ids };
      await applySeed043(seed);
      await apply070(seed, { withGucs: false });
    }, 120000);

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    it('adds the static_response column (TEXT, nullable)', async () => {
      const { rows } = await ctx.testPool.query<{
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name   = 'prompt_bank'
            AND column_name  = 'static_response'`,
        [ctx.schemaName],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.data_type).toBe('text');
      expect(rows[0]!.is_nullable).toBe('YES');
    });

    it('adds the model_tier column (VARCHAR(10), NOT NULL, default standard)', async () => {
      const { rows } = await ctx.testPool.query<{
        data_type: string;
        character_maximum_length: number;
        is_nullable: string;
        column_default: string | null;
      }>(
        `SELECT data_type, character_maximum_length, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name   = 'prompt_bank'
            AND column_name  = 'model_tier'`,
        [ctx.schemaName],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.data_type).toBe('character varying');
      expect(rows[0]!.character_maximum_length).toBe(10);
      expect(rows[0]!.is_nullable).toBe('NO');
      expect(rows[0]!.column_default).toMatch(/standard/);
    });

    it('adds the prompt_bank_ck_model_tier check constraint', async () => {
      // Constraint exists.
      const { rows } = await ctx.testPool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM pg_constraint c
           JOIN pg_class t        ON t.oid = c.conrelid
           JOIN pg_namespace n    ON n.oid = t.relnamespace
          WHERE c.conname    = 'prompt_bank_ck_model_tier'
            AND n.nspname    = $1
            AND t.relname    = 'prompt_bank'
            AND c.contype    = 'c'`,
        [ctx.schemaName],
      );
      expect(rows[0]!.count).toBe('1');

      // The constraint accepts the documented values and refuses others.
      // Use one of the seeded prompts (out_of_scope) as the target row.
      const update = (tier: string): Promise<unknown> =>
        ctx.testPool.query(
          `UPDATE prompt_bank SET model_tier = $1
             WHERE tenant_id = $2 AND agent_type = 'regalica'
               AND function_name = 'aggregate_out_of_scope'`,
          [tier, seed.tenantId],
        );
      await expect(update('lite')).resolves.toBeDefined();
      await expect(update('standard')).resolves.toBeDefined();
      await expect(update('pro')).resolves.toBeDefined();
      await expect(update('xxl')).rejects.toThrow();
    });
  });

  describe('070-B — promotion draft → active', () => {
    it('GUCs absent → promotion is skipped, prompts stay in draft', async () => {
      const ctx = await setupMigrationsSchema(69);
      try {
        const ids = await seedTenantWithAuthorAndValidator(ctx, 'tenant-test-070-b1');
        const seed: SeedContext = { ctx, ...ids };
        await applySeed043(seed);
        await apply070(seed, { withGucs: false });
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM prompt_bank
             WHERE tenant_id = $1 AND status = 'draft'`,
          [seed.tenantId],
        );
        expect(rows[0]!.count).toBe('22');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('author = validator → migration raises 4-eyes violation', async () => {
      const ctx = await setupMigrationsSchema(69);
      try {
        const ids = await seedTenantWithAuthorAndValidator(ctx, 'tenant-test-070-b2');
        const seed: SeedContext = { ctx, ...ids };
        await applySeed043(seed);
        await expect(apply070(seed, { withGucs: true, selfValidator: true })).rejects.toThrow(
          /4-eyes violation/,
        );
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);

    it('GUCs distinct → 22 prompts promoted to active, validator stamped', async () => {
      const ctx = await setupMigrationsSchema(69);
      try {
        const ids = await seedTenantWithAuthorAndValidator(ctx, 'tenant-test-070-b3');
        const seed: SeedContext = { ctx, ...ids };
        await applySeed043(seed);
        await apply070(seed, { withGucs: true });
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM prompt_bank
             WHERE tenant_id = $1 AND status = 'active'
               AND validator_user_id = $2
               AND author_user_id   != validator_user_id
               AND validated_at IS NOT NULL`,
          [seed.tenantId, seed.validatorId],
        );
        expect(rows[0]!.count).toBe('22');
      } finally {
        await teardownMigrationsSchema(ctx);
      }
    }, 120000);
  });

  describe('070-C — static_response backfill', () => {
    let ctx: MigrationsTestContext;
    let seed: SeedContext;

    beforeAll(async () => {
      ctx = await setupMigrationsSchema(69);
      const ids = await seedTenantWithAuthorAndValidator(ctx, 'tenant-test-070-c');
      seed = { ctx, ...ids };
      await applySeed043(seed);
      await apply070(seed, { withGucs: false });
    }, 120000);

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    it('aggregate_out_of_scope receives a non-null static_response', async () => {
      const { rows } = await ctx.testPool.query<{ static_response: string | null }>(
        `SELECT static_response FROM prompt_bank
           WHERE tenant_id = $1 AND agent_type = 'regalica'
             AND function_name = 'aggregate_out_of_scope'`,
        [seed.tenantId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.static_response).toMatch(/sort du périmètre/);
    });

    it('aggregate_ambiguous keeps a NULL static_response (bifurcation preserved)', async () => {
      const { rows } = await ctx.testPool.query<{ static_response: string | null }>(
        `SELECT static_response FROM prompt_bank
           WHERE tenant_id = $1 AND agent_type = 'regalica'
             AND function_name = 'aggregate_ambiguous'`,
        [seed.tenantId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.static_response).toBeNull();
    });
  });
});
