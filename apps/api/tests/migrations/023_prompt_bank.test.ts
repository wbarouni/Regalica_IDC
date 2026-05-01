import {
  expectSqlState,
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 023 — prompt_bank', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let ownerUserId: string;
  let nonOwnerUserId: string;
  let reviewerUserId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(23);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-023', 'Legal Test 023') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    // Three users: platform_owner, non-owner, and a distinct reviewer.
    const owner = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-owner', 'owner@tenant-001.example', 'Owner')
         RETURNING id`,
      [tenantId],
    );
    ownerUserId = owner.rows[0]!.id;

    const nonOwner = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-non-owner', 'non-owner@tenant-001.example', 'Non Owner')
         RETURNING id`,
      [tenantId],
    );
    nonOwnerUserId = nonOwner.rows[0]!.id;

    const reviewer = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-reviewer-023', 'reviewer-023@tenant-001.example', 'Reviewer 023')
         RETURNING id`,
      [tenantId],
    );
    reviewerUserId = reviewer.rows[0]!.id;

    // The platform_owner role was auto-seeded by the tenants trigger from
    // migration 007. Assign it to ownerUserId only.
    const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'platform_owner'`,
      [tenantId],
    );
    const platformOwnerRoleId = roleRows[0]!.id;

    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id)
         VALUES ($1, $2, $3)`,
      [tenantId, ownerUserId, platformOwnerRoleId],
    );
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertPrompt(suffix: string, actorUserId: string | null): Promise<number | null> {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      if (actorUserId) {
        await client.query(`SET LOCAL app.current_user_id = '${actorUserId}'`);
      }
      const res = await client.query(
        `INSERT INTO prompt_bank (
           tenant_id, agent_type, function_name, version,
           template, input_schema, output_schema,
           valid_from, author_user_id
         ) VALUES (
           $1, 'regalica_router', 'classify_${suffix}', 1,
           'Classify intent for {{user_message}}',
           '{"type":"object","properties":{"user_message":{"type":"string"}}}'::jsonb,
           '{"type":"object"}'::jsonb,
           NOW(), $2
         )`,
        [tenantId, ownerUserId],
      );
      await client.query('COMMIT');
      return res.rowCount;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  it('creates prompt_bank with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'prompt_bank'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the 4 RLS policies gated on platform_owner', async () => {
    const { rows } = await ctx.testPool.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies
         WHERE schemaname = $1 AND tablename = 'prompt_bank'
         ORDER BY policyname`,
      [ctx.schemaName],
    );
    expect(rows.map((r) => r.policyname)).toEqual([
      'prompt_bank_delete',
      'prompt_bank_insert',
      'prompt_bank_select',
      'prompt_bank_update',
    ]);
  });

  it('has the unique partial index on (tenant_id, agent_type, function_name) WHERE status=active', async () => {
    const { rows } = await ctx.testPool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
         WHERE schemaname = $1 AND indexname = 'prompt_bank_idx_unique_active'`,
      [ctx.schemaName],
    );
    expect(rows[0]!.indexdef).toMatch(/UNIQUE INDEX/);
    // Postgres reformats partial-index predicates on VARCHAR columns as
    // `(status)::text = 'active'::text` — tolerate the cast and parens.
    expect(rows[0]!.indexdef).toMatch(/WHERE.*status.*=.*'active'/i);
  });

  it('rejects temperature outside [0, 2]', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_user_id = '${ownerUserId}'`);
      await expect(
        client.query(
          `INSERT INTO prompt_bank (
             tenant_id, agent_type, function_name, version,
             template, input_schema, output_schema, temperature,
             valid_from, author_user_id
           ) VALUES (
             $1, 'regalica_router', 'temp_bad', 1,
             'T', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb, 3.0,
             NOW(), $2
           )`,
          [tenantId, ownerUserId],
        ),
      ).rejects.toThrow(/prompt_bank_ck_temperature/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('rejects non-object input_schema via validate_prompt_schema CHECK', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_user_id = '${ownerUserId}'`);
      await expect(
        client.query(
          `INSERT INTO prompt_bank (
             tenant_id, agent_type, function_name, version,
             template, input_schema, output_schema,
             valid_from, author_user_id
           ) VALUES (
             $1, 'regalica_router', 'schema_bad', 1,
             'T', '"not-an-object"'::jsonb, '{"type":"object"}'::jsonb,
             NOW(), $2
           )`,
          [tenantId, ownerUserId],
        ),
      ).rejects.toThrow(/prompt_bank_ck_input_schema/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('rejects status=active/deprecated with same author and validator', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_user_id = '${ownerUserId}'`);
      await expect(
        client.query(
          `INSERT INTO prompt_bank (
             tenant_id, agent_type, function_name, version,
             template, input_schema, output_schema,
             valid_from, author_user_id, validator_user_id, validated_at, status
           ) VALUES (
             $1, 'regalica_router', '4eyes_bad', 1,
             'T', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb,
             NOW(), $2, $2, NOW(), 'active'
           )`,
          [tenantId, ownerUserId],
        ),
      ).rejects.toThrow(/prompt_bank_ck_four_eyes/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('allows INSERT when acting as platform_owner', async () => {
    const count = await insertPrompt('ok', ownerUserId);
    expect(count).toBe(1);
  });

  it('blocks INSERT when actor lacks platform_owner role (RLS WITH CHECK)', async () => {
    // SQLSTATE 42501 insufficient_privilege — locale-stable. PG raises
    // this for both an RLS WITH CHECK denial and a plain GRANT failure;
    // here it covers the RLS path because the role check is a
    // prerequisite of the WITH CHECK predicate.
    await expectSqlState(insertPrompt('denied', nonOwnerUserId), '42501');
  });

  it('blocks SELECT when actor lacks platform_owner role (RLS USING)', async () => {
    // Insert something as owner first.
    await insertPrompt('select_target', ownerUserId);

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${nonOwnerUserId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM prompt_bank
           WHERE function_name = 'classify_select_target'`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });

  it('has the audit trigger attached', async () => {
    const { rows } = await ctx.testPool.query<{ tgname: string }>(
      `SELECT t.tgname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         WHERE c.relname = 'prompt_bank'
           AND c.relnamespace = to_regnamespace($1)::oid
           AND NOT t.tgisinternal
           AND t.tgname = 'prompt_bank_audit'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
  });

  it('supports promotion to status=active with a distinct validator', async () => {
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_user_id = '${ownerUserId}'`);
      const res = await client.query(
        `INSERT INTO prompt_bank (
           tenant_id, agent_type, function_name, version,
           template, input_schema, output_schema,
           valid_from, author_user_id, validator_user_id, validated_at, status
         ) VALUES (
           $1, 'regalica_router', 'promoted', 1,
           'T', '{"type":"object"}'::jsonb, '{"type":"object"}'::jsonb,
           NOW(), $2, $3, NOW(), 'active'
         )`,
        [tenantId, ownerUserId, reviewerUserId],
      );
      await client.query('COMMIT');
      expect(res.rowCount).toBe(1);
    } finally {
      client.release();
    }
  });
});
