import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 022a — rules.rules_ck_operator extended (SUM, VA)', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  const ORIGINAL_OPERATORS = ['=', '>=', '<=', '>', '<', 'MAX', 'MIN'] as const;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(22);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-022a', 'Legal Test 022a') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const a = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-022a-author', 'author@tenant-001.example', 'Author 022a')
         RETURNING id`,
      [tenantId],
    );
    authorId = a.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  const insertRule = (operator: string, numRegle: number) =>
    ctx.testPool.query(
      `INSERT INTO rules (
         tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
         natural_language, terms, terms_count, is_inter_annexe, involved_annexes,
         valid_from, author_user_id
       ) VALUES (
         $1, 'AX01', $2, 'intra_ax', $3, 'NL', '[]'::jsonb, 0, FALSE,
         ARRAY['00']::text[], NOW(), $4
       )`,
      [tenantId, numRegle, operator, authorId],
    );

  it('accepts the SUM operator (added in 022a)', async () => {
    await expect(insertRule('SUM', 100)).resolves.toBeDefined();
  });

  it('accepts the VA operator (added in 022a)', async () => {
    await expect(insertRule('VA', 101)).resolves.toBeDefined();
  });

  it('still accepts every operator from the original 022 set', async () => {
    let n = 200;
    for (const op of ORIGINAL_OPERATORS) {
      await expect(insertRule(op, n++)).resolves.toBeDefined();
    }
  });

  it('rejects unknown operators with rules_ck_operator violation', async () => {
    await expect(insertRule('XYZ', 999)).rejects.toThrow(/rules_ck_operator/);
  });
});
