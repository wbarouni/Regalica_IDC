import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 022 — rules', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;
  let reviewerId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(22);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-022', 'Legal Test 022') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const a = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-022-author', 'author@tenant-001.example', 'Author')
         RETURNING id`,
      [tenantId],
    );
    authorId = a.rows[0]!.id;

    const r = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-022-reviewer', 'reviewer@tenant-001.example', 'Reviewer')
         RETURNING id`,
      [tenantId],
    );
    reviewerId = r.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('creates the rules table with the expected columns', async () => {
    const { rows } = await ctx.testPool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = 'rules'`,
      [ctx.schemaName],
    );
    const names = new Set(rows.map((r) => r.column_name));
    for (const expected of [
      'id',
      'tenant_id',
      'ax_term',
      'num_regle',
      'version',
      'type_ctrl_computed',
      'operator',
      'natural_language',
      'terms',
      'terms_count',
      'is_inter_annexe',
      'involved_annexes',
      'source_rag_chunk_id',
      'valid_from',
      'valid_to',
      'author_user_id',
      'validator_user_id',
      'status',
    ]) {
      expect(names.has(expected)).toBe(true);
    }
  });

  it('creates all 6 indexes including the 2 GIN indexes', async () => {
    const { rows } = await ctx.testPool.query<{
      indexname: string;
      indexdef: string;
    }>(
      `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = $1 AND tablename = 'rules'`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'rules_idx_tenant_active',
        'rules_idx_ax_term',
        'rules_idx_involved_annexes',
        'rules_idx_terms_gin',
        'rules_idx_valid_from',
        'rules_idx_status',
      ]),
    );
    const ginIndexes = rows.filter((r) => r.indexdef.includes('USING gin'));
    expect(ginIndexes.map((r) => r.indexname).sort()).toEqual([
      'rules_idx_involved_annexes',
      'rules_idx_terms_gin',
    ]);
  });

  it('has the audit trigger attached', async () => {
    const { rows } = await ctx.testPool.query<{ tgname: string }>(
      `SELECT t.tgname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relname = 'rules'
           AND c.relnamespace = to_regnamespace($1)::oid
           AND NOT t.tgisinternal
           AND t.tgname = 'rules_audit'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects operator outside the enum', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO rules (
           tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
           natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
           valid_from, author_user_id
         ) VALUES (
           $1, 'AX01', 1, 'intra_ax', '??', 'NL', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
           NOW(), $2
         )`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/rules_ck_operator/);
  });

  it('rejects type_ctrl_computed outside intra_ax/inter_ax', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO rules (
           tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
           natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
           valid_from, author_user_id
         ) VALUES (
           $1, 'AX01', 2, 'hybrid_ax', '=', 'NL', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
           NOW(), $2
         )`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/rules_ck_type_ctrl/);
  });

  it('rejects status=active with same author and validator (4-eyes)', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO rules (
           tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
           natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
           valid_from, author_user_id, validator_user_id, validated_at, status
         ) VALUES (
           $1, 'AX01', 3, 'intra_ax', '=', 'NL', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
           NOW(), $2, $2, NOW(), 'active'
         )`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/rules_ck_four_eyes/);
  });

  it('accepts status=active with a distinct validator', async () => {
    const { rowCount } = await ctx.testPool.query(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
         natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
         valid_from, author_user_id, validator_user_id, validated_at, status
       ) VALUES (
         $1, 'AX01', 4, 'inter_ax', '=',
         'Bilan = somme des comptes',
         '[{"rang":1,"oper":"plus","ax_origine":"00","rubrique":"AC","colonne":"1","sequence":1,"is_sentinel_c":false,"is_sentinel_d":false}]'::jsonb,
         1, TRUE, ARRAY['00','01']::text[],
         NOW(), $2, $3, NOW(), 'active'
       )`,
      [tenantId, authorId, reviewerId],
    );
    expect(rowCount).toBe(1);
  });

  it('enforces rules_uk_natural on (tenant_id, ax_term, num_regle, valid_from)', async () => {
    const ts = new Date().toISOString();
    await ctx.testPool.query(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
         natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
         valid_from, author_user_id
       ) VALUES (
         $1, 'AX99', 1, 'intra_ax', '=', 'NL', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
         $2, $3
       )`,
      [tenantId, ts, authorId],
    );
    await expect(
      ctx.testPool.query(
        `INSERT INTO rules (
           tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
           natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
           valid_from, author_user_id
         ) VALUES (
           $1, 'AX99', 1, 'intra_ax', '=', 'NL duplicate', '[]'::jsonb, 0, FALSE, ARRAY['00']::text[],
           $2, $3
         )`,
        [tenantId, ts, authorId],
      ),
    ).rejects.toThrow(/rules_uk_natural/);
  });
});
