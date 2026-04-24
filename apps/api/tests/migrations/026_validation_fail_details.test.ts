import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 026 — validation_fail_details', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;
  let ruleId: string;
  let runId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(26);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-026', 'Legal Test 026') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-026', 'user-026@tenant-001.example', 'User 026')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;

    const rule = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
         natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
         valid_from, author_user_id
       ) VALUES (
         $1, 'AX01', 1, 'intra_ax', '=', 'NL', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
         NOW(), $2
       ) RETURNING id`,
      [tenantId, userId],
    );
    ruleId = rule.rows[0]!.id;

    const up = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO xml_uploads (
         tenant_id, code_banque, code_annexe, date_annexe,
         file_name, file_size_bytes, file_hash_sha256, content_compressed,
         uploaded_by_user_id
       ) VALUES (
         $1, 'BANK-CODE', '00', '2026-04-24',
         'primary.xml', 2048, repeat('c', 64), '\\x00'::bytea, $2
       ) RETURNING id`,
      [tenantId, userId],
    );
    const uploadId = up.rows[0]!.id;

    const run = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO validation_runs (
         tenant_id, primary_annexe_code, arrete_date, primary_upload_id,
         initiated_by_user_id,
         rules_version_snapshot, referentials_version_snapshot, engine_version
       ) VALUES (
         $1, '00', '2026-04-24', $2, $3,
         '{}'::jsonb, '{}'::jsonb, '1.0.0'
       ) RETURNING id`,
      [tenantId, uploadId, userId],
    );
    runId = run.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertVfd(
    overrides: Partial<{
      severity: string;
      isSentinel: boolean;
      iterationIndex: number | null;
    }> = {},
  ): Promise<void> {
    const severity = overrides.severity ?? 'severe';
    const isSentinel = overrides.isSentinel ?? false;
    const iterationIndex = overrides.iterationIndex === undefined ? null : overrides.iterationIndex;
    await ctx.testPool.query(
      `INSERT INTO validation_fail_details (
         tenant_id, validation_run_id, rule_id,
         ax_term, num_regle,
         is_sentinel_iteration, iteration_index,
         severity, calculation_trace
       ) VALUES (
         $1, $2, $3,
         'AX01', 1,
         $4, $5,
         $6, '{}'::jsonb
       )`,
      [tenantId, runId, ruleId, isSentinel, iterationIndex, severity],
    );
  }

  it('creates validation_fail_details with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'validation_fail_details'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the 4 expected indexes', async () => {
    const { rows } = await ctx.testPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
         WHERE schemaname = $1 AND tablename = 'validation_fail_details'
         ORDER BY indexname`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'vfd_idx_run',
        'vfd_idx_rule',
        'vfd_idx_cluster',
        'vfd_idx_severity',
      ]),
    );
  });

  it('rejects severity outside severe / rounding', async () => {
    await expect(insertVfd({ severity: 'critical' })).rejects.toThrow(/vfd_ck_severity/);
  });

  it('accepts severity = severe and severity = rounding', async () => {
    await insertVfd({ severity: 'severe' });
    await insertVfd({ severity: 'rounding' });
  });

  it('rejects is_sentinel_iteration=TRUE with iteration_index NULL', async () => {
    await expect(insertVfd({ isSentinel: true, iterationIndex: null })).rejects.toThrow(
      /vfd_ck_sentinel_coherence/,
    );
  });

  it('rejects is_sentinel_iteration=FALSE with iteration_index NOT NULL', async () => {
    await expect(insertVfd({ isSentinel: false, iterationIndex: 3 })).rejects.toThrow(
      /vfd_ck_sentinel_coherence/,
    );
  });

  it('accepts is_sentinel_iteration=TRUE with iteration_index set', async () => {
    await insertVfd({ isSentinel: true, iterationIndex: 7 });
  });

  it('blocks SELECT from another tenant (RLS USING)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-026-other', 'Legal Other 026') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    await insertVfd();

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM validation_fail_details`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });
});
