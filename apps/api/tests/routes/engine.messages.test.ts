import jwt from 'jsonwebtoken';
import request from 'supertest';

import { config } from '../../src/config.js';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

function engineToken(tenantId: string): string {
  const secret = config.jwt.secret;
  if (secret === undefined) {
    throw new Error('JWT_SECRET must be set in test env');
  }
  return jwt.sign({ role: 'regflow_engine', tenant_id: tenantId }, secret);
}

describeIfDb('routes — engine /messages (POST /api/engine/conversations/:id/messages)', () => {
  let ctx: RoutesTestContext;
  let conversationId: string;

  beforeAll(async () => {
    ctx = await setupRoutesContext(55);

    const conv = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO conversations (tenant_id, user_id, language)
       VALUES ($1, $2, 'fr')
       RETURNING id`,
      [ctx.tenantId, ctx.userId],
    );
    conversationId = conv.rows[0]!.id;
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  it('rejects without Authorization header (401)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/conversations/${conversationId}/messages`)
      .send({
        tenant_id: ctx.tenantId,
        role: 'assistant',
        content: 'hi',
      });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_BEARER');
  });

  it('rejects with non-engine role (403)', async () => {
    const secret = config.jwt.secret;
    if (secret === undefined) throw new Error('JWT_SECRET unset');
    const token = jwt.sign({ role: 'someone_else', tenant_id: ctx.tenantId }, secret);
    const res = await request(ctx.app)
      .post(`/api/engine/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        tenant_id: ctx.tenantId,
        role: 'assistant',
        content: 'hi',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('rejects malformed conversationId (400)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/conversations/not-a-uuid/messages`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({
        tenant_id: ctx.tenantId,
        role: 'assistant',
        content: 'hi',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CONVERSATION_ID');
  });

  it('rejects empty content (400)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({
        tenant_id: ctx.tenantId,
        role: 'assistant',
        content: '',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });

  it('rejects mismatched body tenant_id vs JWT claim (403)', async () => {
    const otherTenantId = '00000000-0000-7000-8000-0000000000aa';
    const res = await request(ctx.app)
      .post(`/api/engine/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({
        tenant_id: otherTenantId,
        role: 'assistant',
        content: 'hi',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_MISMATCH');
  });

  it('returns 404 when conversation does not belong to tenant', async () => {
    const fakeConvId = '00000000-0000-7000-8000-000000000bbb';
    const res = await request(ctx.app)
      .post(`/api/engine/conversations/${fakeConvId}/messages`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({
        tenant_id: ctx.tenantId,
        role: 'assistant',
        content: 'hi',
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONVERSATION_NOT_FOUND');
  });

  it('persists an assistant message and assigns the next sequence_number', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({
        tenant_id: ctx.tenantId,
        role: 'assistant',
        content: 'Réception confirmée pour RSM630.',
        metadata: { type: 'briefing', agents_triggered: ['investigator'] },
        produced_by_agent: 'regalica/xml_received',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.body.data.role).toBe('regalica_response');
    expect(res.body.data.sequence_number).toBe(1);

    const row = await ctx.testPool.query<{
      content_markdown: string;
      content_json: { type: string };
      produced_by_agent: string;
    }>(
      `SELECT content_markdown, content_json, produced_by_agent
       FROM messages WHERE id = $1`,
      [res.body.data.id],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]!.content_markdown).toBe('Réception confirmée pour RSM630.');
    expect(row.rows[0]!.content_json).toEqual({
      type: 'briefing',
      agents_triggered: ['investigator'],
    });
    expect(row.rows[0]!.produced_by_agent).toBe('regalica/xml_received');
  });

  it('persists a system message and increments sequence_number', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send({
        tenant_id: ctx.tenantId,
        role: 'system',
        content: 'Run failed during T0',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('system_notification');
    expect(res.body.data.sequence_number).toBeGreaterThanOrEqual(2);
  });
});
