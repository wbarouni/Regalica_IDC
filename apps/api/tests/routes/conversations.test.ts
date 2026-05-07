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

  describe('GET /:conversationId/messages — P5 hydration', () => {
    it('rejects an invalid conversationId UUID with 400', async () => {
      const res = await request(ctx.app)
        .get(`/api/tenants/${ctx.tenantId}/conversations/not-a-uuid/messages`)
        .set('X-User-Id', ctx.userId);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CONVERSATION_ID');
    });

    it('returns 404 for a conversation that does not belong to the tenant', async () => {
      const fakeId = '00000000-0000-7000-8000-000000000000';
      const res = await request(ctx.app)
        .get(`/api/tenants/${ctx.tenantId}/conversations/${fakeId}/messages`)
        .set('X-User-Id', ctx.userId);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
    });

    it('returns the empty list for a conversation with no messages', async () => {
      // Create a fresh conversation owned by the test user.
      const created = await request(ctx.app)
        .post(`/api/tenants/${ctx.tenantId}/conversations`)
        .set('X-User-Id', ctx.userId)
        .send({ title: 'P5 — empty hydration' });
      expect(created.status).toBe(201);
      const cid = created.body.data.id as string;

      const res = await request(ctx.app)
        .get(`/api/tenants/${ctx.tenantId}/conversations/${cid}/messages`)
        .set('X-User-Id', ctx.userId);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(0);
    });

    it('returns surfaced messages ordered by sequence_number, internal roles filtered', async () => {
      // Create the conversation, then INSERT messages directly via the
      // test pool (the route does NOT expose an insert path; engine.ts
      // and chatbot-py persist via their own privileged connections).
      // We reproduce the same RLS-respecting INSERT pattern.
      const created = await request(ctx.app)
        .post(`/api/tenants/${ctx.tenantId}/conversations`)
        .set('X-User-Id', ctx.userId)
        .send({ title: 'P5 — ordered hydration' });
      expect(created.status).toBe(201);
      const cid = created.body.data.id as string;

      const client = await ctx.testPool.connect();
      try {
        await client.query(`SET search_path TO ${ctx.schemaName}, public`);
        await client.query(`SET LOCAL app.current_tenant_id = '${ctx.tenantId}'`);
        await client.query(`SET LOCAL app.current_user_id = '${ctx.userId}'`);
        // sequence_number must respect msg_uk_sequence (UNIQUE).
        await client.query(
          `INSERT INTO messages (tenant_id, conversation_id, sequence_number, role, content_markdown)
             VALUES ($1, $2, 1, 'user', 'Bonjour Regalica')`,
          [ctx.tenantId, cid],
        );
        await client.query(
          `INSERT INTO messages (tenant_id, conversation_id, sequence_number, role, content_markdown)
             VALUES ($1, $2, 2, 'regalica_thinking', 'internal trace — must be filtered')`,
          [ctx.tenantId, cid],
        );
        await client.query(
          `INSERT INTO messages (tenant_id, conversation_id, sequence_number, role, content_markdown)
             VALUES ($1, $2, 3, 'regalica_response', 'Bonjour, je vous écoute.')`,
          [ctx.tenantId, cid],
        );
      } finally {
        client.release();
      }

      const res = await request(ctx.app)
        .get(`/api/tenants/${ctx.tenantId}/conversations/${cid}/messages`)
        .set('X-User-Id', ctx.userId);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.data[0].role).toBe('user');
      expect(res.body.data[0].sequence_number).toBe(1);
      expect(res.body.data[0].content_markdown).toBe('Bonjour Regalica');
      expect(res.body.data[1].role).toBe('regalica_response');
      expect(res.body.data[1].sequence_number).toBe(3);
      expect(res.body.data[1].content_markdown).toBe('Bonjour, je vous écoute.');
    });
  });
});
