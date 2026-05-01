import jwt from 'jsonwebtoken';
import request from 'supertest';

import { config } from '../../src/config.js';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

function buildValidXml(marker: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DeclarationBCT>',
    '  <Header>',
    '    <CodeBanque>BANK-CODE</CodeBanque>',
    '    <CodeAnnexe>RSM630</CodeAnnexe>',
    '    <DateAnnexe>2024-03-31</DateAnnexe>',
    '  </Header>',
    `  <Body><Marker>${marker}</Marker></Body>`,
    '</DeclarationBCT>',
  ].join('\n');
}

interface RuleSeed {
  id: string;
}

describeIfDb('routes — runs (POST /api/tenants/:t/runs + /api/engine)', () => {
  let ctx: RoutesTestContext;
  let primaryUploadId: string;
  let companionUploadId: string;
  let ruleId: string;

  beforeAll(async () => {
    ctx = await setupRoutesContext(55);

    // Seed two uploads (deduplication uses SHA-256 so the bodies must
    // differ). Both belong to ctx.tenantId via the route under test.
    const first = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .set('X-User-Id', ctx.userId)
      .attach('file', Buffer.from(buildValidXml('PRIMARY')), {
        filename: 'rsm630.xml',
        contentType: 'application/xml',
      });
    expect(first.status).toBe(201);
    primaryUploadId = first.body.data.upload_id;

    const second = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/uploads`)
      .set('X-User-Id', ctx.userId)
      .attach('file', Buffer.from(buildValidXml('COMPANION')), {
        filename: 'rsm630-companion.xml',
        contentType: 'application/xml',
      });
    expect(second.status).toBe(201);
    companionUploadId = second.body.data.upload_id;

    // Need a real rule for fail-details FK. Reproduce the workspace
    // test's rule seed pattern.
    const seed = ctx.testPool;
    const client = await seed.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${ctx.tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${ctx.userId}'`);
      const validator = await client.query<{ id: string }>(
        `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
           VALUES ($1, 'sso-validator-runs', 'val-runs@tenant-001.example', 'ValRuns')
           RETURNING id`,
        [ctx.tenantId],
      );
      const validatorId = validator.rows[0]!.id;
      const rule = await client.query<RuleSeed>(
        `INSERT INTO rules
           (tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
            natural_language, terms, terms_count, is_inter_annexe,
            involved_annexes, valid_from, author_user_id, status,
            validator_user_id, validated_at)
         VALUES ($1, 'RSM630', 200, 'intra_ax', '=',
                 'rule', '[]'::jsonb, 0, false,
                 ARRAY['RSM630'], '2024-01-01', $2, 'active',
                 $3, NOW())
         RETURNING id`,
        [ctx.tenantId, ctx.userId, validatorId],
      );
      ruleId = rule.rows[0]!.id;
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

  // ---- POST /api/tenants/:tenantId/runs ----

  it('rejects requests without X-User-Id (401)', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/runs`)
      .set('Content-Type', 'application/json')
      .send({
        upload_ids: [primaryUploadId],
        primary_upload_id: primaryUploadId,
        arrete_date: '2024-03-31',
      });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_USER_ID');
  });

  it('rejects an invalid body (400)', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/runs`)
      .set('X-User-Id', ctx.userId)
      .send({ upload_ids: ['not-a-uuid'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_BODY');
  });

  it('rejects when primary_upload_id is not in upload_ids (400)', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/runs`)
      .set('X-User-Id', ctx.userId)
      .send({
        upload_ids: [primaryUploadId],
        primary_upload_id: companionUploadId,
        arrete_date: '2024-03-31',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRIMARY_NOT_IN_LIST');
  });

  it('rejects an upload not owned by the tenant (403)', async () => {
    // Insert a tenant + upload in a different tenant; expect 403.
    const otherTenant = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO tenants (slug, legal_name)
         VALUES ('tenant-other-runs', 'Other') RETURNING id`,
    );
    const otherTenantId = otherTenant.rows[0]!.id;
    const otherUser = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
         VALUES ($1, 'sso-other-runs', 'oth-runs@example', 'Other')
         RETURNING id`,
      [otherTenantId],
    );
    const otherUserId = otherUser.rows[0]!.id;
    const otherUpload = await request(ctx.app)
      .post(`/api/tenants/${otherTenantId}/uploads`)
      .set('X-User-Id', otherUserId)
      .attach('file', Buffer.from(buildValidXml('OTHER-TENANT')), {
        filename: 'rsm630-other.xml',
        contentType: 'application/xml',
      });
    expect(otherUpload.status).toBe(201);
    const otherUploadId = otherUpload.body.data.upload_id;

    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/runs`)
      .set('X-User-Id', ctx.userId)
      .send({
        upload_ids: [otherUploadId],
        primary_upload_id: otherUploadId,
        arrete_date: '2024-03-31',
      });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('UPLOAD_NOT_OWNED');
  });

  it('creates a run with primary + companion upload links (201)', async () => {
    const res = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/runs`)
      .set('X-User-Id', ctx.userId)
      .send({
        upload_ids: [primaryUploadId, companionUploadId],
        primary_upload_id: primaryUploadId,
        arrete_date: '2024-03-31',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.run_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(res.body.data.status).toBe('running');

    const links = await ctx.testPool.query<{ xml_upload_id: string; role: string }>(
      `SELECT xml_upload_id, role
       FROM validation_run_uploads
       WHERE validation_run_id = $1
       ORDER BY role`,
      [res.body.data.run_id],
    );
    expect(links.rows).toHaveLength(2);
    const primary = links.rows.find((r) => r.role === 'primary')!;
    const companion = links.rows.find((r) => r.role === 'companion')!;
    expect(primary.xml_upload_id).toBe(primaryUploadId);
    expect(companion.xml_upload_id).toBe(companionUploadId);
  });

  // ---- POST /api/engine/runs/:runId/fail-details ----

  it('engine route rejects without Authorization header (401)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/00000000-0000-7000-8000-000000000099/fail-details`)
      .send({ items: [] });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_BEARER');
  });

  it('engine route rejects with a non-engine role (403)', async () => {
    const secret = config.jwt.secret;
    if (secret === undefined) {
      throw new Error('JWT_SECRET must be set in test env');
    }
    const token = jwt.sign({ role: 'someone_else', tenant_id: ctx.tenantId }, secret);
    const res = await request(ctx.app)
      .post(`/api/engine/runs/00000000-0000-7000-8000-000000000099/fail-details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [] });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  it('engine route rejects when JWT lacks tenant_id claim (400)', async () => {
    const secret = config.jwt.secret;
    if (secret === undefined) {
      throw new Error('JWT_SECRET must be set in test env');
    }
    const token = jwt.sign({ role: 'regflow_engine' }, secret);
    const res = await request(ctx.app)
      .post(`/api/engine/runs/00000000-0000-7000-8000-000000000099/fail-details`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MISSING_TENANT_CLAIM');
  });

  it('engine route inserts fail-details on a valid engine token (201)', async () => {
    // First create a run to attach fail-details to.
    const runRes = await request(ctx.app)
      .post(`/api/tenants/${ctx.tenantId}/runs`)
      .set('X-User-Id', ctx.userId)
      .send({
        upload_ids: [primaryUploadId],
        primary_upload_id: primaryUploadId,
        arrete_date: '2024-03-31',
      });
    expect(runRes.status).toBe(201);
    const runId = runRes.body.data.run_id;

    const secret = config.jwt.secret;
    if (secret === undefined) {
      throw new Error('JWT_SECRET must be set in test env');
    }
    const token = jwt.sign({ role: 'regflow_engine', tenant_id: ctx.tenantId }, secret);
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/fail-details`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            rule_id: ruleId,
            ax_term: 'RSM630',
            num_regle: 200,
            severity: 'severe',
            expected_value: 100,
            computed_value: 90,
            gap_absolute: 10,
            calculation_trace: { foo: 'bar' },
          },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.inserted).toBe(1);

    const persisted = await ctx.testPool.query<{ severity: string }>(
      `SELECT severity FROM validation_fail_details WHERE validation_run_id = $1`,
      [runId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]!.severity).toBe('severe');
  });

  it('engine route returns 404 when the run does not belong to the JWT tenant', async () => {
    const fakeRunId = '00000000-0000-7000-8000-000000000aaa';
    const secret = config.jwt.secret;
    if (secret === undefined) {
      throw new Error('JWT_SECRET must be set in test env');
    }
    const token = jwt.sign({ role: 'regflow_engine', tenant_id: ctx.tenantId }, secret);
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${fakeRunId}/fail-details`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            rule_id: ruleId,
            ax_term: 'RSM630',
            num_regle: 200,
            severity: 'severe',
            calculation_trace: {},
          },
        ],
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUN_NOT_FOUND');
  });
});
