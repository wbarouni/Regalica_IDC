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

describeIfDb('migration 059 — promote_prompt_xml_received', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;
  let validatorId: string;

  beforeAll(async () => {
    // Stop at 057: 058 (seed draft) + 059 (promote to active) are both
    // applied manually below with the seed/validator GUCs set, so they
    // actually mutate prompt_bank.
    ctx = await setupMigrationsSchema(57);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-059', 'Legal Test 059') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const author = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-059-author', 'author-059@tenant-001.example', 'Author 059')
         RETURNING id`,
      [tenantId],
    );
    authorId = author.rows[0]!.id;

    const validator = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-059-validator', 'validator-059@tenant-001.example', 'Validator 059')
         RETURNING id`,
      [tenantId],
    );
    validatorId = validator.rows[0]!.id;

    // Both author and validator must hold platform_owner — RLS gates
    // every prompt_bank UPDATE on that role and migration 059 acts as
    // the validator.
    const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'platform_owner'`,
      [tenantId],
    );
    const platformOwnerRoleId = roleRows[0]!.id;
    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3), ($1, $4, $3)`,
      [tenantId, authorId, platformOwnerRoleId, validatorId],
    );

    const seed058 = await readFile(
      join(MIGRATIONS_DIR, '058_seed_prompt_xml_received.sql'),
      'utf8',
    );
    const promote059 = await readFile(
      join(MIGRATIONS_DIR, '059_promote_prompt_xml_received.sql'),
      'utf8',
    );

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_validator_user_id = '${validatorId}'`);
      await client.query(`SET app.seed_valid_from = '2025-01-01'`);
      await client.query(seed058);
      await client.query(promote059);
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('promotes regalica/xml_received from draft to active', async () => {
    const { rows } = await ctx.testPool.query<{
      status: string;
      validator_user_id: string | null;
      validated_at: Date | null;
      author_user_id: string;
    }>(
      `SELECT status, validator_user_id, validated_at, author_user_id
         FROM prompt_bank
         WHERE tenant_id = $1
           AND agent_type = 'regalica'
           AND function_name = 'xml_received'
           AND version = 1`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('active');
    expect(rows[0]!.validator_user_id).toBe(validatorId);
    expect(rows[0]!.validated_at).not.toBeNull();
    expect(rows[0]!.author_user_id).toBe(authorId);
  });

  it('appears in v_active_prompts after promotion', async () => {
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM v_active_prompts
         WHERE tenant_id = $1
           AND agent_type = 'regalica'
           AND function_name = 'xml_received'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('1');
  });

  it('is idempotent — re-applying the promotion mutates no rows', async () => {
    const promote059 = await readFile(
      join(MIGRATIONS_DIR, '059_promote_prompt_xml_received.sql'),
      'utf8',
    );
    const before = await ctx.testPool.query<{ updated_at: Date }>(
      `SELECT updated_at FROM prompt_bank
         WHERE tenant_id = $1 AND agent_type = 'regalica' AND function_name = 'xml_received'`,
      [tenantId],
    );
    const beforeUpdatedAt = before.rows[0]!.updated_at;

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_validator_user_id = '${validatorId}'`);
      await client.query(promote059);
    } finally {
      client.release();
    }

    const after = await ctx.testPool.query<{ updated_at: Date; status: string }>(
      `SELECT updated_at, status FROM prompt_bank
         WHERE tenant_id = $1 AND agent_type = 'regalica' AND function_name = 'xml_received'`,
      [tenantId],
    );
    expect(after.rows[0]!.status).toBe('active');
    // Re-run targets WHERE status='draft' — already active, so the row
    // is untouched and updated_at stays bit-identical.
    expect(after.rows[0]!.updated_at.toISOString()).toBe(beforeUpdatedAt.toISOString());
  });

  it('does not promote rows belonging to other tenants', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-059-other', 'Legal Test 059 other') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;
    const otherAuthor = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-059-other-author', 'author-059b@tenant-001.example', 'Other Author')
         RETURNING id`,
      [otherTenantId],
    );
    const otherAuthorId = otherAuthor.rows[0]!.id;
    const { rows: otherRoles } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'platform_owner'`,
      [otherTenantId],
    );
    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [otherTenantId, otherAuthorId, otherRoles[0]!.id],
    );

    const seed058 = await readFile(
      join(MIGRATIONS_DIR, '058_seed_prompt_xml_received.sql'),
      'utf8',
    );
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${otherTenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${otherAuthorId}'`);
      await client.query(`SET app.seed_valid_from = '2025-01-01'`);
      await client.query(seed058);
    } finally {
      client.release();
    }

    // Run 059 again with the FIRST tenant's GUCs — the other tenant's
    // draft must remain untouched.
    const promote059 = await readFile(
      join(MIGRATIONS_DIR, '059_promote_prompt_xml_received.sql'),
      'utf8',
    );
    const client2 = await ctx.testPool.connect();
    try {
      await client2.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client2.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client2.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client2.query(`SET app.seed_validator_user_id = '${validatorId}'`);
      await client2.query(promote059);
    } finally {
      client2.release();
    }

    const { rows } = await ctx.testPool.query<{ status: string }>(
      `SELECT status FROM prompt_bank
         WHERE tenant_id = $1 AND agent_type = 'regalica' AND function_name = 'xml_received'`,
      [otherTenantId],
    );
    expect(rows[0]!.status).toBe('draft');
  });

  it('rejects a promotion where author equals validator (4-eyes)', async () => {
    const promote059 = await readFile(
      join(MIGRATIONS_DIR, '059_promote_prompt_xml_received.sql'),
      'utf8',
    );
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      // Validator == author -> defensive RAISE EXCEPTION fires.
      await client.query(`SET app.seed_validator_user_id = '${authorId}'`);
      await expect(client.query(promote059)).rejects.toThrow(/4-yeux/);
    } finally {
      client.release();
    }
  });
});
