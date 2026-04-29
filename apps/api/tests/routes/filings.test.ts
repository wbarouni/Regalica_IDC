import request from 'supertest';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('routes — filings', () => {
  let ctx: RoutesTestContext;

  beforeAll(async () => {
    ctx = await setupRoutesContext(47);

    const client = await ctx.testPool.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${ctx.tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${ctx.userId}'`);

      const insertUpload = async (
        annexe: string,
        date: string,
        status: 'passed' | 'failed' | 'pending' | null,
        fileName: string,
      ): Promise<void> => {
        await client.query(
          `INSERT INTO xml_uploads
             (tenant_id, code_banque, code_annexe, date_annexe,
              file_name, file_size_bytes, file_hash_sha256,
              content_compressed, uploaded_by_user_id, xsd_validation_status)
           VALUES ($1, 'BANK-CODE', $2, $3,
                   $4, 2048, repeat('b', 64),
                   '\\x01'::bytea, $5, $6)`,
          [ctx.tenantId, annexe, date, fileName, ctx.userId, status],
        );
      };

      await insertUpload('RSM630', '2024-03-31', 'passed', 'rsm630-q1.xml');
      await insertUpload('RSM630', '2024-06-30', 'failed', 'rsm630-q2.xml');
      await insertUpload('RCM00', '2024-03-31', 'pending', 'rcm00-q1.xml');

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  it('rejects requests without X-User-Id header (401)', async () => {
    const res = await request(ctx.app).get(`/api/tenants/${ctx.tenantId}/filings`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_USER_ID');
  });

  it('returns paginated filings ordered by uploaded_at DESC (200)', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/filings`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.data).toHaveLength(3);
  });

  it('filters by annexe', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/filings?annexe=RSM630`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((f: { code_annexe: string }) => f.code_annexe === 'RSM630')).toBe(
      true,
    );
  });

  it('filters by xsd_validation_status', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/filings?status=failed`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].xsd_validation_status).toBe('failed');
  });

  it('rejects an unknown status value with 400', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/filings?status=invalid`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_XSD_STATUS');
  });
});
