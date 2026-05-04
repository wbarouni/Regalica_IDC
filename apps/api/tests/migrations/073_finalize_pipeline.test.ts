import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import {
  expectSqlState,
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const MIGRATIONS_DIR = resolve(__dirname, '../../migrations');
const SEEDS_PATH = resolve(__dirname, '../../seeds/run_error_codes.json');

interface SeedFile {
  version: number;
  items: Array<{
    code: string;
    label_fr: string;
    label_en: string;
    label_ar: string;
    severity: 'error' | 'warning';
  }>;
}

describeIfDb(
  'migration 073 — finalize pipeline (error_code + correlation_id + run_error_codes)',
  () => {
    let ctx: MigrationsTestContext;
    let seed: SeedFile;

    beforeAll(async () => {
      ctx = await setupMigrationsSchema(73);
      seed = JSON.parse(await readFile(SEEDS_PATH, 'utf8')) as SeedFile;
    }, 120000);

    afterAll(async () => {
      await teardownMigrationsSchema(ctx);
    });

    // ────────────────────────────────────────────────────────────────────
    // 073-A — colonnes validation_runs.error_code + correlation_id
    // ────────────────────────────────────────────────────────────────────

    describe('073-A — validation_runs columns', () => {
      it('adds validation_runs.error_code as TEXT NULL', async () => {
        const { rows } = await ctx.testPool.query<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'validation_runs'
            AND column_name = 'error_code'`,
          [ctx.schemaName],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.data_type).toBe('text');
        expect(rows[0]!.is_nullable).toBe('YES');
      });

      it('adds validation_runs.correlation_id as UUID NULL', async () => {
        const { rows } = await ctx.testPool.query<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'validation_runs'
            AND column_name = 'correlation_id'`,
          [ctx.schemaName],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.data_type).toBe('uuid');
        expect(rows[0]!.is_nullable).toBe('YES');
      });

      it('creates the partial index validation_runs_idx_correlation_id', async () => {
        const { rows } = await ctx.testPool.query<{ indexdef: string }>(
          `SELECT indexdef
           FROM pg_indexes
          WHERE schemaname = $1
            AND tablename = 'validation_runs'
            AND indexname = 'validation_runs_idx_correlation_id'`,
          [ctx.schemaName],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0]!.indexdef.toUpperCase()).toContain('CORRELATION_ID');
        expect(rows[0]!.indexdef).toContain('IS NOT NULL');
      });
    });

    // ────────────────────────────────────────────────────────────────────
    // 073-B — table run_error_codes
    // ────────────────────────────────────────────────────────────────────

    describe('073-B — run_error_codes table', () => {
      it('creates run_error_codes with the canonical column shape', async () => {
        const { rows } = await ctx.testPool.query<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
          WHERE table_schema = $1
            AND table_name = 'run_error_codes'
          ORDER BY ordinal_position`,
          [ctx.schemaName],
        );
        const byName = new Map(rows.map((r) => [r.column_name, r]));
        expect(byName.get('code')?.data_type).toBe('text');
        expect(byName.get('code')?.is_nullable).toBe('NO');
        expect(byName.get('label_fr')?.data_type).toBe('text');
        expect(byName.get('label_fr')?.is_nullable).toBe('NO');
        expect(byName.get('label_en')?.is_nullable).toBe('NO');
        expect(byName.get('label_ar')?.is_nullable).toBe('NO');
        expect(byName.get('severity')?.is_nullable).toBe('NO');
      });

      it('enables FORCE RLS + open SELECT policy on run_error_codes', async () => {
        const { rows: classRows } = await ctx.testPool.query<{
          relrowsecurity: boolean;
          relforcerowsecurity: boolean;
        }>(
          `SELECT relrowsecurity, relforcerowsecurity
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = 'run_error_codes'`,
          [ctx.schemaName],
        );
        expect(classRows[0]!.relrowsecurity).toBe(true);
        expect(classRows[0]!.relforcerowsecurity).toBe(true);

        const { rows: policies } = await ctx.testPool.query<{
          policyname: string;
          cmd: string;
        }>(
          `SELECT policyname, cmd
           FROM pg_policies
          WHERE schemaname = $1 AND tablename = 'run_error_codes'`,
          [ctx.schemaName],
        );
        expect(policies).toHaveLength(1);
        expect(policies[0]!.policyname).toBe('run_error_codes_select');
        expect(policies[0]!.cmd).toBe('SELECT');
      });

      it('enforces code format CHECK (snake_case starting with a letter)', async () => {
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'run_error_codes'
            AND c.conname = 'run_error_codes_ck_code_format'
            AND c.contype = 'c'`,
        );
        expect(rows[0]!.count).toBe('1');
      });

      it('enforces severity CHECK ∈ {error, warning}', async () => {
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'run_error_codes'
            AND c.conname = 'run_error_codes_ck_severity'
            AND c.contype = 'c'`,
        );
        expect(rows[0]!.count).toBe('1');
      });
    });

    // ────────────────────────────────────────────────────────────────────
    // 073-C — foreign key validation_runs.error_code → run_error_codes(code)
    // ────────────────────────────────────────────────────────────────────

    describe('073-C — foreign key', () => {
      it('creates validation_runs_fk_error_code with ON DELETE RESTRICT', async () => {
        const { rows } = await ctx.testPool.query<{
          confdeltype: string;
          ref_table: string;
        }>(
          `SELECT c.confdeltype, ref.relname AS ref_table
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_class ref ON ref.oid = c.confrelid
          WHERE t.relname = 'validation_runs'
            AND c.conname = 'validation_runs_fk_error_code'
            AND c.contype = 'f'`,
        );
        expect(rows).toHaveLength(1);
        // 'r' = NO ACTION (default), 'c' = CASCADE, 'n' = SET NULL,
        // 'd' = SET DEFAULT, 'a' = NO ACTION explicit.
        // Per PostgreSQL: ON DELETE RESTRICT maps to confdeltype='r'.
        expect(rows[0]!.confdeltype).toBe('r');
        expect(rows[0]!.ref_table).toBe('run_error_codes');
      });
    });

    // ────────────────────────────────────────────────────────────────────
    // 073-D — AMENDMENT migration 036 GRANT
    // ────────────────────────────────────────────────────────────────────

    describe('073-D — GRANT UPDATE (error_code, correlation_id) on validation_runs to regflow_engine', () => {
      it('grants column-level UPDATE on error_code to regflow_engine', async () => {
        const { rows } = await ctx.testPool.query<{
          column_name: string;
          privilege_type: string;
        }>(
          `SELECT column_name, privilege_type
           FROM information_schema.column_privileges
          WHERE table_schema = $1
            AND table_name   = 'validation_runs'
            AND column_name  = 'error_code'
            AND grantee      = 'regflow_engine'
            AND privilege_type = 'UPDATE'`,
          [ctx.schemaName],
        );
        expect(rows).toHaveLength(1);
      });

      it('grants column-level UPDATE on correlation_id to regflow_engine', async () => {
        const { rows } = await ctx.testPool.query<{
          column_name: string;
          privilege_type: string;
        }>(
          `SELECT column_name, privilege_type
           FROM information_schema.column_privileges
          WHERE table_schema = $1
            AND table_name   = 'validation_runs'
            AND column_name  = 'correlation_id'
            AND grantee      = 'regflow_engine'
            AND privilege_type = 'UPDATE'`,
          [ctx.schemaName],
        );
        expect(rows).toHaveLength(1);
      });
    });

    // ────────────────────────────────────────────────────────────────────
    // 073-E — seed run_error_codes (6 lignes, conformes au JSON canonique)
    // ────────────────────────────────────────────────────────────────────

    describe('073-E — seed run_error_codes', () => {
      it('seeds exactly the entries listed in apps/api/seeds/run_error_codes.json', async () => {
        const { rows } = await ctx.testPool.query<{
          code: string;
          label_fr: string;
          label_en: string;
          label_ar: string;
          severity: string;
        }>(
          `SELECT code, label_fr, label_en, label_ar, severity
           FROM run_error_codes
          ORDER BY code`,
        );

        const expectedSorted = [...seed.items].sort((a, b) => a.code.localeCompare(b.code));
        expect(rows).toHaveLength(expectedSorted.length);
        for (let i = 0; i < rows.length; i += 1) {
          expect(rows[i]!.code).toBe(expectedSorted[i]!.code);
          expect(rows[i]!.label_fr).toBe(expectedSorted[i]!.label_fr);
          expect(rows[i]!.label_en).toBe(expectedSorted[i]!.label_en);
          expect(rows[i]!.label_ar).toBe(expectedSorted[i]!.label_ar);
          expect(rows[i]!.severity).toBe(expectedSorted[i]!.severity);
        }
      });

      it('seeds the 6 canonical Tranche-0 codes', async () => {
        const { rows } = await ctx.testPool.query<{ code: string }>(
          `SELECT code FROM run_error_codes ORDER BY code`,
        );
        const codes = rows.map((r) => r.code);
        expect(codes).toEqual([
          't0_embedded_fail',
          't0_parse_error',
          't0_xsd_invalid',
          't1_engine_exception',
          't1_no_verdicts',
          't1_timeout',
        ]);
      });

      it('is idempotent — re-applying the seed yields the same row count', async () => {
        const sql = await readFile(join(MIGRATIONS_DIR, '073_finalize_pipeline.sql'), 'utf8');
        const client = await ctx.testPool.connect();
        try {
          await client.query(`SET search_path TO ${ctx.schemaName}, public`);
          await client.query(sql);
        } finally {
          client.release();
        }
        const { rows } = await ctx.testPool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM run_error_codes`,
        );
        expect(Number.parseInt(rows[0]!.count, 10)).toBe(seed.items.length);
      });

      it('rejects a malformed code via the format CHECK (e.g. uppercase)', async () => {
        // The migration runs as superuser bypassing RLS / column GRANTs.
        // We exercise the CHECK constraint directly via the test pool.
        await expectSqlState(
          ctx.testPool.query(
            `INSERT INTO run_error_codes (code, label_fr, label_en, label_ar, severity)
             VALUES ('T0_BAD', 'x', 'x', 'x', 'error')`,
          ),
          '23514',
        );
      });

      it('rejects a severity outside {error, warning}', async () => {
        await expectSqlState(
          ctx.testPool.query(
            `INSERT INTO run_error_codes (code, label_fr, label_en, label_ar, severity)
             VALUES ('t0_bad_sev', 'x', 'x', 'x', 'critical')`,
          ),
          '23514',
        );
      });
    });

    // ────────────────────────────────────────────────────────────────────
    // 073-F — seed platform_config retry parameters
    // ────────────────────────────────────────────────────────────────────

    describe('073-F — seed platform_config retry tunables', () => {
      it('seeds t1_finalize_retry_max as a positive integer', async () => {
        const { rows } = await ctx.testPool.query<{ config_value: unknown }>(
          `SELECT config_value FROM platform_config
          WHERE config_key = 't1_finalize_retry_max'
            AND deleted_at IS NULL`,
        );
        expect(rows).toHaveLength(1);
        expect(typeof rows[0]!.config_value).toBe('number');
        expect(rows[0]!.config_value).toBeGreaterThanOrEqual(1);
      });

      it('seeds t1_finalize_retry_backoff_seconds as an array of positive numbers', async () => {
        const { rows } = await ctx.testPool.query<{ config_value: unknown }>(
          `SELECT config_value FROM platform_config
          WHERE config_key = 't1_finalize_retry_backoff_seconds'
            AND deleted_at IS NULL`,
        );
        expect(rows).toHaveLength(1);
        const value = rows[0]!.config_value;
        expect(Array.isArray(value)).toBe(true);
        const arr = value as unknown[];
        expect(arr.length).toBeGreaterThan(0);
        for (const v of arr) {
          expect(typeof v).toBe('number');
          expect(v as number).toBeGreaterThan(0);
        }
      });
    });

    // ────────────────────────────────────────────────────────────────────
    // Integration — FK + cascade behaviour
    // ────────────────────────────────────────────────────────────────────

    describe('integration — validation_runs.error_code FK behaviour', () => {
      it('rejects an UPDATE setting validation_runs.error_code to a code not in run_error_codes (FK violation)', async () => {
        // Seed the minimum context for one validation_runs row: tenant +
        // user + xml_upload + run.
        const t = await ctx.testPool.query<{ id: string }>(
          `INSERT INTO tenants (slug, legal_name)
           VALUES ('tenant-073-fk', 'Legal 073 FK') RETURNING id`,
        );
        const tenantId = t.rows[0]!.id;

        const u = await ctx.testPool.query<{ id: string }>(
          `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
           VALUES ($1, 'sso-073-fk', 'fk-073@tenant-001.example', 'FK 073')
           RETURNING id`,
          [tenantId],
        );
        const userId = u.rows[0]!.id;

        const x = await ctx.testPool.query<{ id: string }>(
          `INSERT INTO xml_uploads (
            tenant_id, code_banque, code_annexe, date_annexe,
            file_name, file_size_bytes, file_hash_sha256,
            content_compressed, compression_algo, encoding_detected,
            uploaded_by_user_id
          )
          VALUES (
            $1, 'BANK-CODE', '00', '2026-02-28',
            'test.xml', 100,
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            decode('1f8b08000000000000', 'hex'), 'gzip', 'utf-8',
            $2
          )
          RETURNING id`,
          [tenantId, userId],
        );
        const xmlId = x.rows[0]!.id;

        const r = await ctx.testPool.query<{ id: string }>(
          `INSERT INTO validation_runs (
            tenant_id, primary_annexe_code, arrete_date, primary_upload_id,
            initiated_by_user_id, rules_version_snapshot,
            referentials_version_snapshot, engine_version
          )
          VALUES (
            $1, '00', '2026-02-28', $2,
            $3, '{}'::jsonb, '{}'::jsonb, 'engine-test'
          )
          RETURNING id`,
          [tenantId, xmlId, userId],
        );
        const runId = r.rows[0]!.id;

        await expectSqlState(
          ctx.testPool.query(
            `UPDATE validation_runs SET error_code = 'totally_unknown_code' WHERE id = $1`,
            [runId],
          ),
          '23503',
        );
      });

      it('accepts an UPDATE setting validation_runs.error_code to a seeded code', async () => {
        // Reuse the row from the previous test by updating with a valid code.
        const { rows: runs } = await ctx.testPool.query<{ id: string }>(
          `SELECT id FROM validation_runs
          WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'tenant-073-fk')`,
        );
        const runId = runs[0]!.id;
        await ctx.testPool.query(
          `UPDATE validation_runs SET error_code = 't0_xsd_invalid' WHERE id = $1`,
          [runId],
        );
        const { rows } = await ctx.testPool.query<{ error_code: string }>(
          `SELECT error_code FROM validation_runs WHERE id = $1`,
          [runId],
        );
        expect(rows[0]!.error_code).toBe('t0_xsd_invalid');
      });
    });
  },
);
