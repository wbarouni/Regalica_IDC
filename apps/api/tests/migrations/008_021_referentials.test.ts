import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

/**
 * Consolidated integration tests for the 14 referentials migrations
 * (008-021). The 14 tables share the common skeleton of Document 6 §9.1
 * (bitemporal + 4-eyes + audit trigger); duplicating 14 test files would
 * be 90 % boilerplate. Instead one suite iterates the table list via a
 * helper for the common assertions, then runs targeted tests on the
 * business-specific columns and CHECK enums of §9.2.
 */

const REFERENTIAL_TABLES = [
  'referentials_annexes',
  'referentials_rubriques',
  'referentials_colonnes',
  'referentials_xml_structures',
  'referentials_sentinels',
  'referentials_banks',
  'referentials_currencies',
  'referentials_sectors',
  'referentials_identifier_types',
  'referentials_consolidation_methods',
  'referentials_instruments',
  'referentials_contract_types',
  'referentials_error_codes',
  'referentials_annexe_dependencies',
] as const;

describeIfDb('migrations 008-021 — referentials common skeleton', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;
  let reviewerId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(21);

    const { rows: tRows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-ref', 'Legal Test Referentials') RETURNING id`,
    );
    tenantId = tRows[0]!.id;

    // Two distinct users for the 4-eyes CHECK.
    const authorRes = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-author', 'author@tenant-001.example', 'Author User')
         RETURNING id`,
      [tenantId],
    );
    authorId = authorRes.rows[0]!.id;

    const reviewerRes = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-reviewer', 'reviewer@tenant-001.example', 'Reviewer User')
         RETURNING id`,
      [tenantId],
    );
    reviewerId = reviewerRes.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  describe.each(REFERENTIAL_TABLES)('table %s', (table) => {
    it('exists with the common skeleton columns', async () => {
      const { rows } = await ctx.testPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2`,
        [ctx.schemaName, table],
      );
      const names = new Set(rows.map((r) => r.column_name));
      for (const expected of [
        'id',
        'tenant_id',
        'code',
        'label',
        'source_circulaire',
        'source_article',
        'source_page',
        'valid_from',
        'valid_to',
        'author_user_id',
        'validator_user_id',
        'validated_at',
        'status',
        'created_at',
        'updated_at',
        'deleted_at',
      ]) {
        expect(names.has(expected)).toBe(true);
      }
    });

    it('has an idx_active partial index', async () => {
      const { rows } = await ctx.testPool.query<{ indexname: string }>(
        `SELECT indexname FROM pg_indexes
           WHERE schemaname = $1 AND tablename = $2
             AND indexname LIKE '%idx_active'`,
        [ctx.schemaName, table],
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('has an audit trigger attached', async () => {
      const { rows } = await ctx.testPool.query<{ tgname: string }>(
        `SELECT t.tgname FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           WHERE c.relname = $1
             AND c.relnamespace = to_regnamespace($2)::oid
             AND NOT t.tgisinternal
             AND t.tgname LIKE $3`,
        [table, ctx.schemaName, `${table}_audit`],
      );
      expect(rows).toHaveLength(1);
    });

    it('rejects status=active without a distinct validator via ck_four_eyes', async () => {
      await expect(
        ctx.testPool.query(
          `INSERT INTO ${table}
             (tenant_id, code, label, valid_from, author_user_id, validator_user_id, status)
             VALUES ($1, 'T-${table}-SAME', 'Same-user attempt', NOW(), $2, $2, 'active')`,
          [tenantId, authorId],
        ),
      ).rejects.toThrow(/ck_four_eyes/);
    });

    it('accepts status=active with a distinct validator', async () => {
      const { rowCount } = await ctx.testPool.query(
        `INSERT INTO ${table}
           (tenant_id, code, label, valid_from, author_user_id, validator_user_id, validated_at, status)
           VALUES ($1, 'T-${table}-OK', 'Distinct validator', NOW(), $2, $3, NOW(), 'active')`,
        [tenantId, authorId, reviewerId],
      );
      expect(rowCount).toBe(1);
    });
  });

  // --- Targeted checks on business-specific columns / CHECK enums ---

  it('referentials_annexes rejects periodicity outside the enum', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_annexes
           (tenant_id, code, label, periodicity, valid_from, author_user_id)
           VALUES ($1, 'ANN-PERIOD-BAD', 'Bad periodicity', 'weekly', NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_annexes_ck_periodicity/);
  });

  it('referentials_annexes rejects xml_structure_type outside 1..10', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_annexes
           (tenant_id, code, label, xml_structure_type, valid_from, author_user_id)
           VALUES ($1, 'ANN-XML-BAD', 'Bad xml type', 11, NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_annexes_ck_xml_type/);
  });

  it('referentials_xml_structures rejects structure_type_number outside 1..10', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_xml_structures
           (tenant_id, code, label, structure_type_number, valid_from, author_user_id)
           VALUES ($1, 'XML-BAD', 'Bad number', 0, NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_xml_structures_ck_type_range/);
  });

  it('referentials_sentinels rejects sentinel_code outside C/D1..D6', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_sentinels
           (tenant_id, code, label, sentinel_code, valid_from, author_user_id)
           VALUES ($1, 'SENT-BAD', 'Bad sentinel', 'X', NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_sentinels_ck_sentinel_code/);
  });

  it('referentials_colonnes rejects data_type outside the enum', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_colonnes
           (tenant_id, code, label, data_type, valid_from, author_user_id)
           VALUES ($1, 'COL-BAD', 'Bad data type', 'blob', NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_colonnes_ck_data_type/);
  });

  it('referentials_banks rejects bank_type outside the enum', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_banks
           (tenant_id, code, label, bank_type, valid_from, author_user_id)
           VALUES ($1, 'BANK-BAD', 'Bad bank type', 'investment', NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_banks_ck_bank_type/);
  });

  it('referentials_identifier_types rejects type_code outside 1..13', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_identifier_types
           (tenant_id, code, label, type_code, valid_from, author_user_id)
           VALUES ($1, 'IDT-BAD', 'Bad type code', 14, NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_identifier_types_ck_type_range/);
  });

  it('referentials_consolidation_methods rejects perimeter_type outside the enum', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_consolidation_methods
           (tenant_id, code, label, perimeter_type, valid_from, author_user_id)
           VALUES ($1, 'CM-BAD', 'Bad perimeter', 'fiscal', NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_consolidation_methods_ck_perimeter/);
  });

  it('referentials_error_codes rejects severity outside severe/warning/info', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_error_codes
           (tenant_id, code, label, severity, valid_from, author_user_id)
           VALUES ($1, 'ERR-BAD', 'Bad severity', 'fatal', NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_error_codes_ck_severity/);
  });

  it('referentials_annexe_dependencies rejects dependency_type outside the enum', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO referentials_annexe_dependencies
           (tenant_id, code, label, dependency_type, valid_from, author_user_id)
           VALUES ($1, 'DEP-BAD', 'Bad dependency type', 'semantic', NOW(), $2)`,
        [tenantId, authorId],
      ),
    ).rejects.toThrow(/ref_annexe_dependencies_ck_dependency_type/);
  });

  it('referentials_xml_structures accepts TEXT[] in affected_annexes', async () => {
    const { rows } = await ctx.testPool.query<{ affected_annexes: string[] }>(
      `INSERT INTO referentials_xml_structures
         (tenant_id, code, label, structure_type_number, affected_annexes, valid_from, author_user_id)
         VALUES ($1, 'XML-ARR-OK', 'With array', 3, ARRAY['00', '01', '02'], NOW(), $2)
         RETURNING affected_annexes`,
      [tenantId, authorId],
    );
    expect(rows[0]!.affected_annexes).toEqual(['00', '01', '02']);
  });

  it('referentials_identifier_types accepts JSONB in validation_rules', async () => {
    const { rows } = await ctx.testPool.query<{
      validation_rules: { checksum: string };
    }>(
      `INSERT INTO referentials_identifier_types
         (tenant_id, code, label, type_code, validation_rules, valid_from, author_user_id)
         VALUES ($1, 'IDT-JSON-OK', 'With rules', 5, '{"checksum": "mod97"}'::jsonb, NOW(), $2)
         RETURNING validation_rules`,
      [tenantId, authorId],
    );
    expect(rows[0]!.validation_rules.checksum).toBe('mod97');
  });
});
