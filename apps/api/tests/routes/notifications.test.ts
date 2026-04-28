import request from 'supertest';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('routes — notifications', () => {
  let ctx: RoutesTestContext;
  let actionRequiredId: string;
  let attentionId: string;
  let infoId: string;

  beforeAll(async () => {
    ctx = await setupRoutesContext(47);

    const insert = async (
      urgency: 'info' | 'attention' | 'action_required',
      title: string,
      isRead = false,
    ): Promise<string> => {
      const r = await ctx.testPool.query<{ id: string }>(
        `INSERT INTO notifications
           (tenant_id, user_id, event_type, urgency_level, title, body, is_read)
         VALUES ($1, $2, 'deadline_approaching', $3, $4, 'body', $5)
         RETURNING id`,
        [ctx.tenantId, ctx.userId, urgency, title, isRead],
      );
      return r.rows[0]!.id;
    };
    actionRequiredId = await insert('action_required', 'urgent');
    attentionId = await insert('attention', 'medium');
    infoId = await insert('info', 'low');
    // One already-read row that must NOT appear in the unread list.
    await insert('info', 'already-read', true);
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  it('lists unread notifications ordered by urgency desc', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/notifications`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].id).toBe(actionRequiredId);
    expect(res.body.data[1].id).toBe(attentionId);
    expect(res.body.data[2].id).toBe(infoId);
    expect(res.body.data.every((n: { is_read: boolean }) => n.is_read === false)).toBe(true);
  });

  it('marks own notification as read', async () => {
    const res = await request(ctx.app)
      .patch(`/api/tenants/${ctx.tenantId}/notifications/${infoId}/read`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.is_read).toBe(true);
    expect(res.body.data.read_at).toBeTruthy();
  });

  it('rejects malformed notification id with 400', async () => {
    const res = await request(ctx.app)
      .patch(`/api/tenants/${ctx.tenantId}/notifications/not-a-uuid/read`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_NOTIF_ID');
  });

  it('returns 404 when notification belongs to another user (RLS)', async () => {
    const otherUser = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-notif-other', 'oth@tenant-001.example', 'Other')
         RETURNING id`,
      [ctx.tenantId],
    );
    const otherUserId = otherUser.rows[0]!.id;
    const otherNotif = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO notifications
         (tenant_id, user_id, event_type, urgency_level, title, body)
       VALUES ($1, $2, 'deadline_approaching', 'info', 'foreign', 'b')
       RETURNING id`,
      [ctx.tenantId, otherUserId],
    );
    const otherNotifId = otherNotif.rows[0]!.id;

    const res = await request(ctx.app)
      .patch(`/api/tenants/${ctx.tenantId}/notifications/${otherNotifId}/read`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
  });
});
