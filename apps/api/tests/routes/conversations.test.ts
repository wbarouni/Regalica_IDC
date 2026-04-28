import request from 'supertest';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('routes — conversations', () => {
  let ctx: RoutesTestContext;

  beforeAll(async () => {
    ctx = await setupRoutesContext(47);
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  it('lists an empty conversation set initially', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/conversations`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('creates a conversation with title + language', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/conversations`)
      .set('X-User-Id', ctx.userId)
      .send({ title: 'Investigation 139/r3', language: 'fr' });
    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Investigation 139/r3');
    expect(res.body.data.language).toBe('fr');
    expect(res.body.data.messages_count).toBe(0);
  });

  it('defaults language to "fr" when omitted', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/conversations`)
      .set('X-User-Id', ctx.userId)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.language).toBe('fr');
    expect(res.body.data.title).toBeNull();
  });

  it('rejects an invalid linked_validation_run_id (400)', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/conversations`)
      .set('X-User-Id', ctx.userId)
      .send({ linked_validation_run_id: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_LINKED_RUN_ID');
  });

  it('lists previously-created conversations newest first', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/conversations`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});
