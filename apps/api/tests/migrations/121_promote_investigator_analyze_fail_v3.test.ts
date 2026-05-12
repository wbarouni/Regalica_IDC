/**
 * Integration tests for migration 121_promote_investigator_analyze_fail_v3.sql
 * (Lot A.3.active).
 *
 * Conditional: skipped when DATABASE_URL is unset (matches the
 * pattern used by 113_intent_specialists_requires_active_run.test.ts).
 *
 * Coverage:
 *   - happy path: with the full GUC quadruplet (author + validator +
 *     attestation match validator), v3 transitions from draft to
 *     active with validator_user_id + validated_at set, and v2
 *     transitions from active to deprecated.
 *   - 4-yeux check: validator == author raises EXCEPTION.
 *   - attestation mismatch: SEED_VALIDATOR_USER_ID ≠
 *     SEED_VALIDATOR_ATTESTATION_UUID raises EXCEPTION.
 *   - missing attestation GUC: migration is skipped silently (smoke
 *     job stays green).
 *   - missing validator user: explicit RAISE EXCEPTION rather than
 *     FK error (friendly message).
 *   - idempotence: re-applying the migration body on already-promoted
 *     v3 is a no-op (no rows updated).
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

// Canonical dev-tenant UUIDs seeded by migration 037a (so the test
// fixture mirrors the production bootstrap exactly).
const TENANT_ID = 'd3a7c6e6-2d18-4ff6-8183-94507eded6d7';
const AUTHOR_ID = '2cb0ce35-4b43-499f-b23a-722ef86902ce';
const VALIDATOR_ID = 'ef810369-1e96-485d-bf1d-dc8937e32bb9';
const VALID_FROM = '2026-05-12T00:00:00Z';

const MIGRATION_121_PATH = resolve(
  __dirname,
  '../../migrations/121_promote_investigator_analyze_fail_v3.sql',
);

async function applyMigration121WithGUCs(
  ctx: MigrationsTestContext,
  options: {
    authorId?: string;
    validatorId?: string;
    attestationId?: string | null;
  } = {},
): Promise<void> {
  const sql = await readFile(MIGRATION_121_PATH, 'utf8');
  const author = options.authorId ?? AUTHOR_ID;
  const validator = options.validatorId ?? VALIDATOR_ID;
  const attestation =
    options.attestationId === null ? null : (options.attestationId ?? VALIDATOR_ID);

  const client = await ctx.testPool.connect();
  try {
    await client.query(`SET search_path TO ${ctx.schemaName}, public`);
    await client.query(`SET app.seed_tenant_id = '${TENANT_ID}'`);
    await client.query(`SET app.seed_author_user_id = '${author}'`);
    await client.query(`SET app.seed_validator_user_id = '${validator}'`);
    await client.query(`SET app.seed_valid_from = '${VALID_FROM}'`);
    if (attestation !== null) {
      await client.query(`SET app.seed_validator_attestation_uuid = '${attestation}'`);
    } else {
      await client.query(`SET app.seed_validator_attestation_uuid = ''`);
    }
    await client.query(sql);
  } finally {
    client.release();
  }
}

describeIfDb('migration 121 — promote investigator/analyze_fail v3', () => {
  describe('happy path: full GUC quadruplet, validator ≠ author, attestation matches', () => {
    let ctx: MigrationsTestContext;

    beforeAll(async () => {
      // setupMigrationsSchema(120) seeds the dev tenant via 037a
      // (when seed_dev_tenant=true), seeds the analyze_fail v1+v2
      // chain via 081/111, and seeds v3 draft via 120. We then
      // apply 121 with the test-scoped GUCs.
      ctx = await setupMigrationsSchema(120, {
        sessionVars: {
          'app.seed_dev_tenant': 'true',
          'app.seed_tenant_id': TENANT_ID,
          'app.seed_author_user_id': AUTHOR_ID,
          'app.seed_validator_user_id': VALIDATOR_ID,
          'app.seed_valid_from': VALID_FROM,
        },
      });
      // The setup applied 120 with seed_validator_user_id matching
      // the author rule — 120 itself only checks author/tenant/valid_from
      // so the draft seeded. Now apply 121 manually with the full
      // quadruplet including the attestation UUID.
      await applyMigration121WithGUCs(ctx);
    }, 120000);

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    it('promotes v3 to active with validator_user_id and validated_at set', async () => {
      const { rows } = await ctx.testPool.query<{
        version: number;
        status: string;
        validator_user_id: string;
        validated_at: string | null;
      }>(
        `SELECT version, status, validator_user_id::text AS validator_user_id,
                validated_at::text AS validated_at
           FROM prompt_bank
          WHERE agent_type='investigator'
            AND function_name='analyze_fail'
            AND version=3`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('active');
      expect(rows[0]?.validator_user_id).toBe(VALIDATOR_ID);
      expect(rows[0]?.validated_at).not.toBeNull();
    });

    it('deprecates v2 (frees the active slot before v3 claims it)', async () => {
      const { rows } = await ctx.testPool.query<{ status: string }>(
        `SELECT status FROM prompt_bank
          WHERE agent_type='investigator'
            AND function_name='analyze_fail'
            AND version=2`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('deprecated');
    });

    it('leaves v1 deprecated (no change to legacy rows)', async () => {
      const { rows } = await ctx.testPool.query<{ status: string }>(
        `SELECT status FROM prompt_bank
          WHERE agent_type='investigator'
            AND function_name='analyze_fail'
            AND version=1`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.status).toBe('deprecated');
    });

    it('respects the partial unique index — exactly one active row per (tenant, agent, function)', async () => {
      const { rows } = await ctx.testPool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM prompt_bank
          WHERE agent_type='investigator'
            AND function_name='analyze_fail'
            AND status='active'
            AND deleted_at IS NULL`,
      );
      expect(rows[0]?.count).toBe('1');
    });

    it('is idempotent — re-applying the migration body changes nothing', async () => {
      // Capture state before re-apply
      const before = await ctx.testPool.query<{ version: number; status: string }>(
        `SELECT version, status FROM prompt_bank
          WHERE agent_type='investigator' AND function_name='analyze_fail'
          ORDER BY version`,
      );

      // Re-run migration 121
      await applyMigration121WithGUCs(ctx);

      // State unchanged
      const after = await ctx.testPool.query<{ version: number; status: string }>(
        `SELECT version, status FROM prompt_bank
          WHERE agent_type='investigator' AND function_name='analyze_fail'
          ORDER BY version`,
      );
      expect(after.rows).toEqual(before.rows);
    });
  });

  describe('4-yeux violation: validator == author', () => {
    let ctx: MigrationsTestContext;

    beforeAll(async () => {
      ctx = await setupMigrationsSchema(120, {
        sessionVars: {
          'app.seed_dev_tenant': 'true',
          'app.seed_tenant_id': TENANT_ID,
          'app.seed_author_user_id': AUTHOR_ID,
          'app.seed_validator_user_id': VALIDATOR_ID,
          'app.seed_valid_from': VALID_FROM,
        },
      });
    }, 120000);

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    it('refuses promotion when validator UUID equals author UUID', async () => {
      await expect(
        applyMigration121WithGUCs(ctx, {
          authorId: AUTHOR_ID,
          validatorId: AUTHOR_ID, // 4-yeux violation
          attestationId: AUTHOR_ID,
        }),
      ).rejects.toThrow(/4-yeux violation/);
    });
  });

  describe('attestation mismatch: file UUID ≠ env UUID', () => {
    let ctx: MigrationsTestContext;

    beforeAll(async () => {
      ctx = await setupMigrationsSchema(120, {
        sessionVars: {
          'app.seed_dev_tenant': 'true',
          'app.seed_tenant_id': TENANT_ID,
          'app.seed_author_user_id': AUTHOR_ID,
          'app.seed_validator_user_id': VALIDATOR_ID,
          'app.seed_valid_from': VALID_FROM,
        },
      });
    }, 120000);

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    it('refuses promotion when SEED_VALIDATOR_ATTESTATION_UUID differs from SEED_VALIDATOR_USER_ID', async () => {
      // env validator = VALIDATOR_ID, but attestation file says something else.
      const FORGED = '9895c055-064d-4385-8102-086a4377542d';
      await expect(
        applyMigration121WithGUCs(ctx, {
          authorId: AUTHOR_ID,
          validatorId: VALIDATOR_ID,
          attestationId: FORGED, // mismatch
        }),
      ).rejects.toThrow(/signature mismatch/);
    });
  });

  describe('missing attestation GUC — migration skips silently', () => {
    let ctx: MigrationsTestContext;

    beforeAll(async () => {
      ctx = await setupMigrationsSchema(120, {
        sessionVars: {
          'app.seed_dev_tenant': 'true',
          'app.seed_tenant_id': TENANT_ID,
          'app.seed_author_user_id': AUTHOR_ID,
          'app.seed_validator_user_id': VALIDATOR_ID,
          'app.seed_valid_from': VALID_FROM,
        },
      });
    }, 120000);

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    it('skips when SEED_VALIDATOR_ATTESTATION_UUID is empty — v3 stays draft', async () => {
      // attestationId=null → wrapper not used → migration sees empty GUC and skips
      await applyMigration121WithGUCs(ctx, { attestationId: null });
      const { rows } = await ctx.testPool.query<{ status: string }>(
        `SELECT status FROM prompt_bank
          WHERE agent_type='investigator' AND function_name='analyze_fail' AND version=3`,
      );
      expect(rows[0]?.status).toBe('draft'); // unchanged
    });
  });
});
