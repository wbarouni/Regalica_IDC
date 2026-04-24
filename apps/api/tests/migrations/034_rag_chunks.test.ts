import {
  setupMigrationsSchema,
  teardownMigrationsSchema,
  type MigrationsTestContext,
} from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('migration 034 — rag_chunks', () => {
  let ctx: MigrationsTestContext;
  let tenantId: string;
  let userId: string;
  let documentId: string;

  beforeAll(async () => {
    ctx = await setupMigrationsSchema(34);

    const t = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-034', 'Legal Test 034') RETURNING id`,
    );
    tenantId = t.rows[0]!.id;

    const u = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-034', 'user-034@tenant-001.example', 'User 034')
         RETURNING id`,
      [tenantId],
    );
    userId = u.rows[0]!.id;

    const doc = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO rag_documents (
         tenant_id, document_type, title, file_name,
         file_hash_sha256, file_size_bytes, ingested_by_user_id
       ) VALUES ($1, 'circulaire_bct', 'doc', 'doc.pdf', repeat('e', 64), 1024, $2)
       RETURNING id`,
      [tenantId, userId],
    );
    documentId = doc.rows[0]!.id;
  });

  afterAll(async () => {
    await teardownMigrationsSchema(ctx);
  });

  function vector768(fill: number): string {
    return '[' + Array.from({ length: 768 }, () => fill).join(',') + ']';
  }

  async function insertChunk(
    overrides: Partial<{ chunkIndex: number; docId: string; tokens: number }> = {},
  ): Promise<void> {
    const chunkIndex = overrides.chunkIndex ?? 0;
    const docId = overrides.docId ?? documentId;
    const tokens = overrides.tokens ?? 42;
    await ctx.testPool.query(
      `INSERT INTO rag_chunks (
         tenant_id, document_id, chunk_index,
         content, content_tokens, embedding
       ) VALUES ($1, $2, $3, 'chunk body text', $4, $5::vector)`,
      [tenantId, docId, chunkIndex, tokens, vector768(0.1)],
    );
  }

  it('creates rag_chunks with RLS enabled and forced', async () => {
    const { rows } = await ctx.testPool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
         WHERE relname = 'rag_chunks'
           AND relnamespace = to_regnamespace($1)::oid`,
      [ctx.schemaName],
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    expect(rows[0]!.relforcerowsecurity).toBe(true);
  });

  it('has the HNSW embedding index with vector_cosine_ops', async () => {
    const { rows } = await ctx.testPool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
         WHERE schemaname = $1
           AND tablename = 'rag_chunks'
           AND indexname = 'rag_chunks_idx_embedding'`,
      [ctx.schemaName],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toMatch(/USING hnsw/);
    expect(rows[0]!.indexdef).toMatch(/vector_cosine_ops/);
  });

  it('has the GIN trigram index on content', async () => {
    const { rows } = await ctx.testPool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
         WHERE schemaname = $1
           AND tablename = 'rag_chunks'
           AND indexname = 'rag_chunks_idx_content_trgm'`,
      [ctx.schemaName],
    );
    expect(rows[0]!.indexdef).toMatch(/USING gin/);
    expect(rows[0]!.indexdef).toMatch(/gin_trgm_ops/);
  });

  it('embedding column is VECTOR with 768 dimensions', async () => {
    const { rows } = await ctx.testPool.query<{ atttypmod: number }>(
      `SELECT a.atttypmod FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         WHERE c.relname = 'rag_chunks'
           AND c.relnamespace = to_regnamespace($1)::oid
           AND a.attname = 'embedding'`,
      [ctx.schemaName],
    );
    // pgvector encodes the declared dimension in atttypmod.
    expect(rows[0]!.atttypmod).toBe(768);
  });

  it('enforces UNIQUE (document_id, chunk_index)', async () => {
    await insertChunk({ chunkIndex: 10 });
    await expect(insertChunk({ chunkIndex: 10 })).rejects.toThrow(/rag_chunks_uk_index/);
  });

  it('rejects embedding with wrong dimension', async () => {
    await expect(
      ctx.testPool.query(
        `INSERT INTO rag_chunks (
           tenant_id, document_id, chunk_index,
           content, content_tokens, embedding
         ) VALUES ($1, $2, 11, 'x', 1, $3::vector)`,
        [tenantId, documentId, '[0.1,0.2,0.3]'],
      ),
    ).rejects.toThrow(/expected 768 dimensions|different vector dimensions/i);
  });

  it('blocks SELECT from another tenant (RLS USING)', async () => {
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-test-034-other', 'Legal Other 034') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;

    await insertChunk({ chunkIndex: 20 });

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${otherTenantId}'`);
      const { rows } = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM rag_chunks`,
      );
      await client.query('COMMIT');
      expect(rows[0]!.count).toBe('0');
    } finally {
      client.release();
    }
  });
});
