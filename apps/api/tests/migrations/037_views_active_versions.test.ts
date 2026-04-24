import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const EXPECTED_VIEWS = [
  'prompt_bank_active',
  'referentials_annexe_dependencies_active',
  'referentials_annexes_active',
  'referentials_banks_active',
  'referentials_colonnes_active',
  'referentials_consolidation_methods_active',
  'referentials_contract_types_active',
  'referentials_currencies_active',
  'referentials_error_codes_active',
  'referentials_identifier_types_active',
  'referentials_instruments_active',
  'referentials_rubriques_active',
  'referentials_sectors_active',
  'referentials_sentinels_active',
  'referentials_xml_structures_active',
  'rules_active',
];

describeIfDb('migration 037 — active-version views', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;
  let reviewerId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(37);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-037', 'Legal Test 037') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const a = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-037-author', 'author@tenant-001.example', 'Author 037')
         RETURNING id`,
      [tenantId],
    );
    authorId = a.rows[0]!.id;

    const r = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-037-reviewer', 'reviewer@tenant-001.example', 'Reviewer 037')
         RETURNING id`,
      [tenantId],
    );
    reviewerId = r.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates all 16 active-version views', async () => {
    const { rows } = await ctx.testPool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.views
         WHERE table_schema = $1
           AND table_name LIKE '%_active'
         ORDER BY table_name`,
      [ctx.schemaName],
    );
    expect(rows.map((r) => r.table_name)).toEqual(EXPECTED_VIEWS);
  });

  it('rules_active filters to status=active, valid_to in future, not deleted', async () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);

    // 4 rows exercise the four cases of the filter.
    // 1) active + future valid_to + not deleted → visible.
    await ctx.testPool.query(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
         natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
         valid_from, valid_to, author_user_id, validator_user_id, validated_at, status
       ) VALUES (
         $1, 'AX01', 100, 'intra_ax', '=', 'NL active', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
         NOW() - INTERVAL '1 day', $2, $3, $4, NOW(), 'active'
       )`,
      [tenantId, future.toISOString(), authorId, reviewerId],
    );
    // 2) draft → hidden.
    await ctx.testPool.query(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
         natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
         valid_from, author_user_id
       ) VALUES (
         $1, 'AX01', 101, 'intra_ax', '=', 'NL draft', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
         NOW(), $2
       )`,
      [tenantId, authorId],
    );
    // 3) active but valid_to already past → hidden.
    await ctx.testPool.query(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
         natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
         valid_from, valid_to, author_user_id, validator_user_id, validated_at, status
       ) VALUES (
         $1, 'AX01', 102, 'intra_ax', '=', 'NL expired', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
         NOW() - INTERVAL '2 years', NOW() - INTERVAL '1 year', $2, $3, NOW(), 'active'
       )`,
      [tenantId, authorId, reviewerId],
    );
    // 4) active + open-ended but soft-deleted → hidden.
    await ctx.testPool.query(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
         natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
         valid_from, author_user_id, validator_user_id, validated_at, status, deleted_at
       ) VALUES (
         $1, 'AX01', 103, 'intra_ax', '=', 'NL deleted', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
         NOW() - INTERVAL '1 day', $2, $3, NOW(), 'active', NOW()
       )`,
      [tenantId, authorId, reviewerId],
    );

    const { rows } = await ctx.testPool.query<{ num_regle: number }>(
      `SELECT num_regle FROM rules_active
         WHERE tenant_id = $1 AND ax_term = 'AX01'
         ORDER BY num_regle`,
      [tenantId],
    );
    expect(rows.map((r) => r.num_regle)).toEqual([100]);
  });

  it('referentials_annexes_active filters the same way', async () => {
    await ctx.testPool.query(
      `INSERT INTO referentials_annexes (
         tenant_id, code, label, valid_from, status, author_user_id, validator_user_id, validated_at
       ) VALUES
         ($1, '900', 'Active annexe', NOW(), 'active', $2, $3, NOW()),
         ($1, '901', 'Draft annexe', NOW(), 'draft', $2, NULL, NULL)`,
      [tenantId, authorId, reviewerId],
    );

    const { rows } = await ctx.testPool.query<{ code: string }>(
      `SELECT code FROM referentials_annexes_active
         WHERE tenant_id = $1 AND code IN ('900', '901')
         ORDER BY code`,
      [tenantId],
    );
    expect(rows.map((r) => r.code)).toEqual(['900']);
  });
});
