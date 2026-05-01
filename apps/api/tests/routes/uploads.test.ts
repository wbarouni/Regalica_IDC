import { gunzipSync } from 'node:zlib';

import request from 'supertest';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

const VALID_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<DeclarationBCT>',
  '  <Header>',
  '    <CodeBanque>BANK-CODE</CodeBanque>',
  '    <CodeAnnexe>RSM630</CodeAnnexe>',
  '    <DateAnnexe>2024-03-31</DateAnnexe>',
  '  </Header>',
  '  <Body><Rubrique><Code>R001</Code><Valeur>1000</Valeur></Rubrique></Body>',
  '</DeclarationBCT>',
].join('\n');

const MISSING_TAG_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<DeclarationBCT>',
  '  <Header>',
  '    <CodeBanque>BANK-CODE</CodeBanque>',
  '    <DateAnnexe>2024-03-31</DateAnnexe>',
  '  </Header>',
  '</DeclarationBCT>',
].join('\n');

describeIfDb('routes — uploads', () => {
  let ctx: RoutesTestContext;

  beforeAll(async () => {
    ctx = await setupRoutesContext(54);
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  it('rejects requests without X-User-Id (401)', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .attach('file', Buffer.from(VALID_XML), {
        filename: 't0.xml',
        contentType: 'application/xml',
      });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_USER_ID');
  });

  it('accepts a valid XML, returns 201 with parsed header metadata', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .set('X-User-Id', ctx.userId)
      .attach('file', Buffer.from(VALID_XML), {
        filename: 'rsm630.xml',
        contentType: 'application/xml',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.upload_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.body.data.filename).toBe('rsm630.xml');
    expect(res.body.data.annexe_code).toBe('RSM630');
    expect(res.body.data.arrete_date).toBe('2024-03-31');
    expect(res.body.data.deduplicated).toBe(false);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.size_bytes).toBe(Buffer.byteLength(VALID_XML, 'utf-8'));
  });

  it('deduplicates a re-uploaded identical file (200 + deduplicated=true)', async () => {
    const first = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .set('X-User-Id', ctx.userId)
      .attach('file', Buffer.from(VALID_XML), {
        filename: 'rsm630.xml',
        contentType: 'application/xml',
      });
    expect([200, 201]).toContain(first.status);
    const second = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .set('X-User-Id', ctx.userId)
      .attach('file', Buffer.from(VALID_XML), {
        filename: 'rsm630.xml',
        contentType: 'application/xml',
      });
    expect(second.status).toBe(200);
    expect(second.body.data.deduplicated).toBe(true);
    expect(second.body.data.upload_id).toBe(first.body.data.upload_id);
  });

  it('rejects an XML missing a required header tag (422)', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .set('X-User-Id', ctx.userId)
      .attach('file', Buffer.from(MISSING_TAG_XML), {
        filename: 'broken.xml',
        contentType: 'application/xml',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('XML_HEADER_INVALID');
    expect(res.body.error.message).toContain('CodeAnnexe');
  });

  it('rejects multipart without a "file" field (400)', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .set('X-User-Id', ctx.userId)
      .field('not_file', 'whatever');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_FILE');
  });

  it('persists file_hash_sha256 and a gzip-compressed body in DB', async () => {
    const xml = VALID_XML.replace('R001', 'R042');
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .set('X-User-Id', ctx.userId)
      .attach('file', Buffer.from(xml), {
        filename: 'rsm630-hash.xml',
        contentType: 'application/xml',
      });
    expect(res.status).toBe(201);
    const row = await ctx.testPool.query<{
      file_hash_sha256: string;
      compression_algo: string;
      content_compressed: Buffer;
    }>(
      `SELECT file_hash_sha256, compression_algo, content_compressed
       FROM xml_uploads WHERE id = $1`,
      [res.body.data.upload_id],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]!.file_hash_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.rows[0]!.compression_algo).toBe('gzip');
    const decompressed = gunzipSync(row.rows[0]!.content_compressed).toString('utf-8');
    expect(decompressed).toBe(xml);
  });
});
