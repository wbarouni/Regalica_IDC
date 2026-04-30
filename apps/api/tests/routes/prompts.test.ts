import request from 'supertest';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('routes — prompts', () => {
  let ctx: RoutesTestContext;
  let runId: string;

  beforeAll(async () => {
    ctx = await setupRoutesContext(52);

    const upload = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO xml_uploads
         (tenant_id, code_banque, code_annexe, date_annexe,
          file_name, file_size_bytes, file_hash_sha256, content_compressed,
          uploaded_by_user_id)
       VALUES ($1, 'BANK-CODE', 'RSM630', '2024-03-31',
               'rsm630.xml', 1024, repeat('a', 64), '\\x01'::bytea, $2)
       RETURNING id`,
      [ctx.tenantId, ctx.userId],
    );
    const uploadId = upload.rows[0]!.id;

    const runRes = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO validation_runs
         (tenant_id, primary_annexe_code, arrete_date, primary_upload_id,
          initiated_by_user_id, rules_version_snapshot,
          referentials_version_snapshot, engine_version, status)
       VALUES ($1, 'RSM630', '2024-03-31', $2, $3,
               '{"rules":[]}'::jsonb, '{"refs":[]}'::jsonb,
               '0.1.0', 'running')
       RETURNING id`,
      [ctx.tenantId, uploadId, ctx.userId],
    );
    runId = runRes.rows[0]!.id;
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  it('returns the 7 active question types ordered by ordinal', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/prompts/suggestions`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.suggestions)).toBe(true);
    expect(res.body.data.suggestions).toHaveLength(7);
    expect(res.body.data.suggestions[0].fnName).toBe('zoom');
    expect(res.body.data.suggestions[0].labelI18nKey).toBe('chip.zoom');
    expect(res.body.data.suggestions[6].fnName).toBe('plan');
    expect(res.body.data.suggestions[6].ordinal).toBe(7);
  });

  it('returns the same list when a valid runId belongs to the tenant', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/prompts/suggestions?runId=${runId}`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.suggestions).toHaveLength(7);
    expect(res.body.data.suggestions.map((s: { fnName: string }) => s.fnName)).toEqual([
      'zoom',
      'cluster',
      'historical',
      'citation',
      'simulation',
      'sanction',
      'plan',
    ]);
  });

  it('returns 404 when runId does not belong to the tenant', async () => {
    const fakeRunId = '00000000-0000-7000-8000-000000000002';
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/prompts/suggestions?runId=${fakeRunId}`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUN_NOT_FOUND');
  });

  it('rejects malformed runId with 400', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/prompts/suggestions?runId=not-a-uuid`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RUN_ID');
  });

  it('rejects requests without X-User-Id header', async () => {
    const res = await request(ctx.app).get(`/api/tenants/${ctx.tenantId}/prompts/suggestions`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_USER_ID');
  });
});
