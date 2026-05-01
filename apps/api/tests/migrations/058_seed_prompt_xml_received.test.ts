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

describeIfDb('migration 058 — seed_prompt_xml_received', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let authorId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(57);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-058', 'Legal Test 058') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-058-author', 'author-058@tenant-001.example', 'Author 058')
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

    const sql = await readFile(join(MIGRATIONS_DIR, '058_seed_prompt_xml_received.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_valid_from = '2025-01-01'`);
      await client.query(sql);
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  it('inserts regalica/xml_received in status=draft', async () => {
    const { rows } = await ctx.testPool.query<{
      status: string;
      temperature: string;
      max_tokens: number;
      thinking_enabled: boolean;
    }>(
      `SELECT status, temperature, max_tokens, thinking_enabled
       FROM prompt_bank
       WHERE tenant_id = $1 AND agent_type = 'regalica' AND function_name = 'xml_received'`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('draft');
    expect(Number(rows[0]!.temperature)).toBeCloseTo(0.7, 5);
    expect(rows[0]!.max_tokens).toBe(1024);
    expect(rows[0]!.thinking_enabled).toBe(false);
  });

  it('output_schema is parseable JSON with required keys', async () => {
    const { rows } = await ctx.testPool.query<{ output_schema: unknown }>(
      `SELECT output_schema FROM prompt_bank
       WHERE tenant_id = $1 AND agent_type = 'regalica' AND function_name = 'xml_received'`,
      [tenantId],
    );
    expect(rows).toHaveLength(1);
    const schema = rows[0]!.output_schema as { properties: Record<string, unknown> };
    expect(schema.properties).toHaveProperty('message');
    expect(schema.properties).toHaveProperty('agents_triggered');
  });

  it('template references the four interpolation slots', async () => {
    const { rows } = await ctx.testPool.query<{ template: string }>(
      `SELECT template FROM prompt_bank
       WHERE tenant_id = $1 AND agent_type = 'regalica' AND function_name = 'xml_received'`,
      [tenantId],
    );
    const tmpl = rows[0]!.template;
    expect(tmpl).toContain('{upload_id}');
    expect(tmpl).toContain('{filename}');
    expect(tmpl).toContain('{annexe_code}');
    expect(tmpl).toContain('{arrete_date}');
  });

  it('is idempotent — re-applying the seed inserts no duplicate', async () => {
    const sql = await readFile(join(MIGRATIONS_DIR, '058_seed_prompt_xml_received.sql'), 'utf8');
    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query(`SET app.seed_tenant_id = '${tenantId}'`);
      await client.query(`SET app.seed_author_user_id = '${authorId}'`);
      await client.query(`SET app.seed_valid_from = '2025-01-01'`);
      await client.query(sql);
    } finally {
      client.release();
    }
    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM prompt_bank
       WHERE tenant_id = $1 AND agent_type = 'regalica' AND function_name = 'xml_received'`,
      [tenantId],
    );
    expect(rows[0]!.count).toBe('1');
  });
});
