import request from 'supertest';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('routes — library', () => {
  let ctx: RoutesTestContext;
  let activeRuleId: string;

  beforeAll(async () => {
    ctx = await setupRoutesContext(47);

    // active rules need validator != author.
    const validator = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-validator-lib', 'val-lib@tenant-001.example', 'ValLib')
         RETURNING id`,
      [ctx.tenantId],
    );
    const validatorId = validator.rows[0]!.id;

    const active = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO rules
         (tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
          natural_language, terms, terms_count, is_inter_annexe,
          involved_annexes, valid_from, author_user_id, status,
          validator_user_id, validated_at)
       VALUES ($1, 'RSM630', 7, 'intra_ax', '=', 'active rule',
               '[]'::jsonb, 0, false, ARRAY['RSM630'], '2024-01-01',
               $2, 'active', $3, NOW())
       RETURNING id`,
      [ctx.tenantId, ctx.userId, validatorId],
    );
    activeRuleId = active.rows[0]!.id;

    // pending_review row (no validator).
    await ctx.testPool.query(
      `INSERT INTO rules
         (tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
          natural_language, terms, terms_count, is_inter_annexe,
          involved_annexes, valid_from, author_user_id, status)
       VALUES ($1, 'RSM630', 8, 'intra_ax', '=', 'pending rule',
               '[]'::jsonb, 0, false, ARRAY['RSM630'], '2024-01-01',
               $2, 'pending_review')`,
      [ctx.tenantId, ctx.userId],
    );

    // One referential entry so /referentials returns non-empty counts.
    await ctx.testPool.query(
      `INSERT INTO referentials_annexes
         (tenant_id, code, label, valid_from, author_user_id, status,
          validator_user_id, validated_at, has_detail_sentinel)
       VALUES ($1, 'RSM630', 'Ventilation Ressources', '2024-01-01',
               $2, 'active', $3, NOW(), false)`,
      [ctx.tenantId, ctx.userId, validatorId],
    );

    // Three rubriques: one under RSM630, one under RCM00, one without
    // annexe_code, all 'active' so they show up in the _active view.
    await ctx.testPool.query(
      `INSERT INTO referentials_rubriques
         (tenant_id, code, label, annexe_code, level, valid_from,
          author_user_id, status, validator_user_id, validated_at)
       VALUES
         ($1, 'AC010000000000', 'Caisse', 'RCM00', 1, '2024-01-01',
          $2, 'active', $3, NOW()),
         ($1, 'PR010000000000', 'Provisions', 'RSM630', 2, '2024-01-01',
          $2, 'active', $3, NOW()),
         ($1, 'XX999999999999', 'Sans annexe', NULL, NULL, '2024-01-01',
          $2, 'active', $3, NOW())`,
      [ctx.tenantId, ctx.userId, validatorId],
    );
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  it('lists active rules paginated', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rules?limit=10`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.some((r: { id: string }) => r.id === activeRuleId)).toBe(true);
  });

  it('filters rules by ax_term', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rules?ax_term=RSM630`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.every((r: { ax_term: string }) => r.ax_term === 'RSM630')).toBe(true);
  });

  it('returns the pending-review queue', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rules/pending-review`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.every((r: { status: string }) => r.status === 'pending_review')).toBe(
      true,
    );
  });

  it('returns rule detail with terms JSONB', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rules/${activeRuleId}`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(activeRuleId);
    expect(Array.isArray(res.body.data.involved_annexes)).toBe(true);
  });

  it('returns 404 for non-active rule id', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rules/00000000-0000-4000-8000-000000000000`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(404);
  });

  it('returns 400 for malformed rule id', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rules/not-a-uuid`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(400);
  });

  it('lists active rubriques paginated', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rubriques?limit=10`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(
      res.body.data.every((r: { code: string; label: string }) => typeof r.code === 'string'),
    ).toBe(true);
  });

  it('filters rubriques by annexe_code', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rubriques?annexe_code=RCM00`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(
      res.body.data.every((r: { annexe_code: string | null }) => r.annexe_code === 'RCM00'),
    ).toBe(true);
  });

  it('filters rubriques by q (ILIKE on code or label)', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/rubriques?q=Provisions`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(
      res.body.data.some(
        (r: { code: string; label: string | null }) =>
          (r.label ?? '').includes('Provisions') || r.code.includes('Provisions'),
      ),
    ).toBe(true);
  });

  it('aggregates referentials across the 14 active views', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/referentials`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.view_count).toBe(14);
    expect(res.body.data).toHaveLength(14);
    const annexes = res.body.data.find((r: { code: string }) => r.code === 'annexes');
    expect(annexes.entry_count).toBeGreaterThanOrEqual(1);
  });
});
