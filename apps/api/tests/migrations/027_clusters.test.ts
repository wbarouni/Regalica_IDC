import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 027 — clusters', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;
  let runId: string;
  let ruleId: string;

  beforeAll(async () => {
    // Tier bumped to 61: migration 027's existence-check for
    // vfd_fk_cluster used a broad information_schema query that, when
    // run against a database where the same constraint exists in
    // another schema (typical local dev DB after a prior
    // `pnpm migrate:up`), saw that row and skipped creation. Migration
    // 061 amends the check with a current_schema()-filtered
    // pg_constraint join so the constraint is created here. CI runs
    // against a fresh container and would pass either way.
    ctx = await setupMigrationsSchema(61);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-027', 'Legal Test 027') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-027', 'user-027@tenant-001.example', 'User 027')
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

  async function insertCluster(
    overrides: Partial<{
      label: string;
      priority: string;
      impact: string;
      confidenceLevel: string;
      runId: string;
    }> = {},
  ): Promise<string> {
    const label = overrides.label ?? 'C1';
    const priority = overrides.priority ?? 'P1';
    const impact = overrides.impact ?? 'high';
    const confidenceLevel = overrides.confidenceLevel ?? 'high';
    const cRunId = overrides.runId ?? runId;
    const { rows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO clusters (
         tenant_id, validation_run_id,
         cluster_label, priority, impact_level,
         root_cause_hypothesis, business_explanation, recommended_action,
         correlation_type,
         fail_count, confidence_level
       ) VALUES (
         $1, $2,
         $3, $4, $5,
         'RC', 'BE', 'RA',
         'balance_sheet_mismatch',
         3, $6
       ) RETURNING id`,
      [tenantId, cRunId, label, priority, impact, confidenceLevel],
    );
    return rows[0]!.id;
  }

  it('creates clusters with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'clusters'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('rejects priority outside P1/P2/P3', async () => {
    await expect(insertCluster({ label: 'C_prio', priority: 'P4' })).rejects.toThrow(
      /clusters_ck_priority/,
    );
  });

  it('rejects impact_level outside high/medium/low', async () => {
    await expect(insertCluster({ label: 'C_imp', impact: 'urgent' })).rejects.toThrow(
      /clusters_ck_impact/,
    );
  });

  it('rejects confidence_level outside the 4 enum values', async () => {
    await expect(insertCluster({ label: 'C_conf', confidenceLevel: 'very_high' })).rejects.toThrow(
      /clusters_ck_confidence/,
    );
  });

  it('enforces UNIQUE (validation_run_id, cluster_label)', async () => {
    await insertCluster({ label: 'C_dup' });
    await expect(insertCluster({ label: 'C_dup' })).rejects.toThrow(/clusters_uk_label_run/);
  });

  it('migration 027 installs vfd_fk_cluster on validation_fail_details.cluster_id', async () => {
    const { rows } = await ctx.testPool.query<{ constraint_name: string }>(
      `SELECT constraint_name FROM information_schema.table_constraints
         WHERE table_schema = $1
           AND table_name = 'validation_fail_details'
           AND constraint_name = 'vfd_fk_cluster'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
  });

  it('FK vfd→clusters rejects orphan cluster_id', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO validation_fail_details (
           tenant_id, validation_run_id, rule_id,
           ax_term, num_regle,
           severity, calculation_trace, cluster_id
         ) VALUES (
           $1, $2, $3, 'AX01', 1, 'severe', '{}'::jsonb,
           '00000000-0000-0000-0000-000000000000'
         )`,
        [tenantId, runId, ruleId],
      ),
    ).rejects.toThrow(/vfd_fk_cluster/);
  });

  it('accepts vfd linked to a valid cluster', async () => {
    const clusterId = await insertCluster({ label: 'C_link' });
    const { rowCount } = await ctx.testPool.query(
      `INSERT INTO validation_fail_details (
         tenant_id, validation_run_id, rule_id,
         ax_term, num_regle,
         severity, calculation_trace, cluster_id
       ) VALUES (
         $1, $2, $3, 'AX01', 1, 'severe', '{}'::jsonb, $4
       )`,
      [tenantId, runId, ruleId, clusterId],
    );
    expect(rowCount).toBe(1);
  });

  it('blocks SELECT from another tenant (RLS USING)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-027-other', 'Legal Other 027') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    await insertCluster({ label: 'C_rls' });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM clusters WHERE cluster_label = 'C_rls'`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });
});
