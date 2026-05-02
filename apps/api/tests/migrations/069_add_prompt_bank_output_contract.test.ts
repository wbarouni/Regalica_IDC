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

describeIfDb('migration 069 — add prompt_bank.output_contract', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(69);

    // Seed a tenant + author user + assign platform_owner so 043 can
    // upsert the canonical 22 prompt_bank rows that this migration
    // backfills.
    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-069', 'Legal Test 069') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-069-author', 'author-069@tenant-001.example', 'Author 069')
         RETURNING id`,
      [tenantId],
    );
    authorId = u.rows[0]!.id;

    const { rows: roleRows } = await ctx.testPool.query<{ id: string }>(
      `SELECT id FROM roles WHERE tenant_id = $1 AND code = 'platform_owner'`,
      [tenantId],
    );
    const platformOwnerRoleId = roleRows[0]!.id;
    await ctx.testPool.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES ($1, $2, $3)`,
      [tenantId, authorId, platformOwnerRoleId],
    );

    // Apply migration 043 first so prompt_bank carries the 22 canonical
    // rows that 069 will backfill.
    const seedSql = await readFile(join(MIGRATIONS_DIR, '043_seed_prompt_bank.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_valid_from = '2025-01-01'`);
      await client.query(seedSql);
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('adds output_contract NOT NULL with the CHECK enum', async () => {
    const { rows } = await ctx.testPool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
    }>(
      `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'prompt_bank'
          AND column_name = 'output_contract'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.is_nullable).toBe('NO');
    expect(rows[0]!.data_type).toBe('character varying');
  });

  it('backfills regalica/aggregate_* rows with output_contract = string', async () => {
    const { rows } = await ctx.testPool.query<{
      function_name: string;
      output_contract: string;
    }>(
      `SELECT function_name, output_contract
         FROM prompt_bank
        WHERE tenant_id = $1
          AND agent_type = 'regalica'
          AND function_name LIKE 'aggregate\\_%' ESCAPE '\\'
        ORDER BY function_name`,
      [tenantId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(8);
    for (const row of rows) {
      expect(row.output_contract).toBe('string');
    }
  });

  it('backfills non-aggregator rows with output_contract = json', async () => {
    const { rows } = await ctx.testPool.query<{
      agent_type: string;
      function_name: string;
      output_contract: string;
    }>(
      `SELECT agent_type, function_name, output_contract
         FROM prompt_bank
        WHERE tenant_id = $1
          AND NOT (agent_type = 'regalica' AND function_name LIKE 'aggregate\\_%' ESCAPE '\\')
        ORDER BY agent_type, function_name`,
      [tenantId],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.output_contract).toBe('json');
    }
  });

  it('rejects any output_contract value outside the enum', async () => {
    await expect(
      ctx.testPool.query(
        `UPDATE prompt_bank SET output_contract = 'xml'
           WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      ),
    ).rejects.toThrow(/output_contract|check/i);
  });
});
