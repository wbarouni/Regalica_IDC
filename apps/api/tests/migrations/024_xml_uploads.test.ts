import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 024 — xml_uploads', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(24);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-024', 'Legal Test 024') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-024', 'user-024@tenant-001.example', 'User 024')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertUpload(
    client: {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    },
    overrides: Partial<{
      fileName: string;
      size: number;
      xsdStatus: string | null;
    }> = {},
  ): Promise<void> {
    const fileName = overrides.fileName ?? 'test.xml';
    const size = overrides.size ?? 1024;
    const xsdStatus = overrides.xsdStatus === undefined ? 'pending' : overrides.xsdStatus;
    await client.query(
      `INSERT INTO xml_uploads (
         tenant_id, code_banque, code_annexe, date_annexe,
         file_name, file_size_bytes, file_hash_sha256, content_compressed,
         uploaded_by_user_id, xsd_validation_status
       ) VALUES (
         $1, 'BANK-CODE', '00', '2026-04-24',
         $2, $3, repeat('a', 64), '\\x00'::bytea,
         $4, $5
       )`,
      [tenantId, fileName, size, userId, xsdStatus],
    );
  }

  it('creates xml_uploads with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'xml_uploads'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the 3 expected indexes', async () => {
    const { rows } = await ctx.testPool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
         WHERE schemaname = $1 AND tablename = 'xml_uploads'
         ORDER BY indexname`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'xml_uploads_idx_tenant_annexe',
        'xml_uploads_idx_user',
        'xml_uploads_idx_hash',
      ]),
    );
  });

  it('rejects file_size_bytes > 100 MiB', async () => {
    await expect(insertUpload(ctx.testPool, { size: 104857601 })).rejects.toThrow(
      /xml_uploads_ck_size/,
    );
  });

  it('rejects file_size_bytes = 0', async () => {
    await expect(insertUpload(ctx.testPool, { size: 0 })).rejects.toThrow(/xml_uploads_ck_size/);
  });

  it('rejects xsd_validation_status outside enum', async () => {
    await expect(insertUpload(ctx.testPool, { xsdStatus: 'unknown' })).rejects.toThrow(
      /xml_uploads_ck_xsd_status/,
    );
  });

  it('accepts xsd_validation_status = NULL', async () => {
    await insertUpload(ctx.testPool, { fileName: 'null-status.xml', xsdStatus: null });
  });

  it('blocks SELECT from another tenant (RLS USING)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-024-other', 'Legal Other 024') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    await insertUpload(ctx.testPool, { fileName: 'visible.xml' });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM xml_uploads WHERE file_name = 'visible.xml'`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });

  it('blocks INSERT when tenant_id != current_app_tenant_id (RLS WITH CHECK)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-024-otherck', 'Legal OtherCK 024') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${userId}'`);
      await expect(
        client.query(
          `INSERT INTO xml_uploads (
             tenant_id, code_banque, code_annexe, date_annexe,
             file_name, file_size_bytes, file_hash_sha256, content_compressed,
             uploaded_by_user_id
           ) VALUES (
             $1, 'BANK-CODE', '00', '2026-04-24',
             'denied.xml', 1024, repeat('b', 64), '\\x00'::bytea,
             $2
           )`,
          [tenantId, userId],
        ),
      ).rejects.toThrow(/row-level security/i);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
