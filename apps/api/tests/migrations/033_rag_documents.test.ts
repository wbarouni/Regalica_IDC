import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 033 — rag_documents', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(33);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-033', 'Legal Test 033') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-033', 'user-033@tenant-001.example', 'User 033')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  async function insertDoc(
    overrides: Partial<{
      docType: string;
      status: string;
      hash: string;
      deleted: boolean;
    }> = {},
  ): Promise<string> {
    const docType = overrides.docType ?? 'circulaire_bct';
    const status = overrides.status ?? 'pending';
    const hash = overrides.hash ?? 'a'.repeat(64);
    const deleted = overrides.deleted ?? false;
    const { rows } = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO rag_documents (
         tenant_id, document_type, title, file_name,
         file_hash_sha256, file_size_bytes,
         ingested_by_user_id, ingestion_status, deleted_at
       ) VALUES (
         $1, $2, 'doc', 'doc.pdf', $3, 1024,
         $4, $5, CASE WHEN $6 THEN NOW() ELSE NULL END
       ) RETURNING id`,
      [tenantId, docType, hash, userId, status, deleted],
    );
    return rows[0]!.id;
  }

  it('creates rag_documents with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'rag_documents'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the type index and the unique hash index', async () => {
    const { rows } = await ctx.testPool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = $1 AND tablename = 'rag_documents'`,
      [ctx.schemaName],
    );
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(expect.arrayContaining(['rag_doc_idx_type', 'rag_doc_uk_hash']));
    const uk = rows.find((r) => r.indexname === 'rag_doc_uk_hash');
    expect(uk?.indexdef).toMatch(/UNIQUE INDEX/);
    expect(uk?.indexdef).toMatch(/WHERE.*deleted_at IS NULL/i);
  });

  it('rejects document_type outside the 5 enum values', async () => {
    await expect(insertDoc({ docType: 'random_doc' })).rejects.toThrow(/rag_doc_ck_type/);
  });

  it('rejects ingestion_status outside the 4 enum values', async () => {
    await expect(insertDoc({ status: 'unknown' })).rejects.toThrow(/rag_doc_ck_status/);
  });

  it('unique hash is enforced on non-deleted rows', async () => {
    await insertDoc({ hash: 'b'.repeat(64) });
    await expect(insertDoc({ hash: 'b'.repeat(64) })).rejects.toThrow(/rag_doc_uk_hash/);
  });

  it('unique hash index ignores soft-deleted rows', async () => {
    await insertDoc({ hash: 'c'.repeat(64), deleted: true });
    // Non-deleted insert with the same hash is now allowed (partial index).
    await insertDoc({ hash: 'c'.repeat(64) });
  });

  it('blocks SELECT from another tenant (RLS USING)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-033-other', 'Legal Other 033') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    await insertDoc({ hash: 'd'.repeat(64) });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE regflow_app');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM rag_documents`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });
});
