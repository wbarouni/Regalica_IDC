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

function engineToken(tenantId: string): string {
  const secret = config.jwt.secret;
  if (secret === undefined) {
    throw new Error('JWT_SECRET must be set in test env');
  }
  return jwt.sign({ role: 'regflow_engine', tenant_id: tenantId }, secret);
}

describeIfDb(
  'routes — engine /agent-steps (POST /api/engine/runs/:runId/agent-steps/:stepId)',
  () => {
    let ctx: RoutesTestContext;
    let runId: string;
    let stepId: string;

    beforeAll(async () => {
      ctx = await setupRoutesContext(55);

      const upload = await request(ctx.app)
        .post(`/api/tenants/${ctx.tenantId}/uploads`)
        .set('X-User-Id', ctx.userId)
        .attach('file', Buffer.from(buildValidXml('PRIMARY')), {
          filename: 'rsm630.xml',
          contentType: 'application/xml',
        });
      expect(upload.status).toBe(201);

      const runRes = await request(ctx.app)
        .post(`/api/tenants/${ctx.tenantId}/runs`)
        .set('X-User-Id', ctx.userId)
        .send({
          upload_ids: [upload.body.data.upload_id],
          primary_upload_id: upload.body.data.upload_id,
          arrete_date: '2024-03-31',
        });
      expect(runRes.status).toBe(201);
      runId = runRes.body.data.run_id;

      // Pre-seed a run_agent_steps row directly (the lazy-init via GET
      // /agents needs an active prompt_bank row, which the test schema
      // doesn't have because seed migration 043 skips when its GUCs are
      // unset — same pattern as workspace.test.ts).
      const stepInsert = await ctx.testPool.query<{ id: string }>(
        `INSERT INTO run_agent_steps
         (run_id, tenant_id, agent_type, function_name, ordinal, status)
       VALUES ($1, $2, 'investigator', 'analyze_fail', 1, 'pending')
       RETURNING id`,
        [runId, ctx.tenantId],
      );
      stepId = stepInsert.rows[0]!.id;
    }, 120000);

    afterAll(async () => {
      await teardownRoutesContext(ctx);
    });

    it('rejects without Authorization header (401)', async () => {
      const res = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/agent-steps/${stepId}`)
        .send({ status: 'current' });
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('MISSING_BEARER');
    });

    it('rejects with non-engine role (403)', async () => {
      const secret = config.jwt.secret;
      if (secret === undefined) throw new Error('JWT_SECRET unset');
      const token = jwt.sign({ role: 'someone_else', tenant_id: ctx.tenantId }, secret);
      const res = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/agent-steps/${stepId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'current' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
    });

    it('rejects malformed runId with 400', async () => {
      const res = await request(ctx.app)
        .post(`/api/engine/runs/not-a-uuid/agent-steps/${stepId}`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send({ status: 'current' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RUN_ID');
    });

    it('rejects malformed stepId with 400', async () => {
      const res = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/agent-steps/not-a-uuid`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send({ status: 'current' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STEP_ID');
    });

    it('rejects invalid status enum with 400', async () => {
      const res = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/agent-steps/${stepId}`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send({ status: 'flying' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_BODY');
    });

    it('returns 404 when stepId belongs to another tenant', async () => {
      const fakeStepId = '00000000-0000-7000-8000-000000000abc';
      const res = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/agent-steps/${fakeStepId}`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send({ status: 'current' });
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('STEP_NOT_FOUND');
    });

    it('updates status to current and returns the patched step', async () => {
      const startedAt = new Date().toISOString();
      const res = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/agent-steps/${stepId}`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send({ status: 'current', startedAt });
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(stepId);
      expect(res.body.data.status).toBe('current');
      expect(res.body.data.startedAt).toBeTruthy();
      expect(res.body.data.completedAt).toBeNull();
      expect(res.body.data.errorMessage).toBeNull();
    });

    it('completes the step and returns durationMs computed by the DB', async () => {
      // First mark current with started_at = now - 1s so duration_ms > 0.
      const startedAt = new Date(Date.now() - 1000).toISOString();
      const completedAt = new Date().toISOString();
      const res = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/agent-steps/${stepId}`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send({ status: 'done', startedAt, completedAt });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('done');
      expect(res.body.data.durationMs).not.toBeNull();
      expect(res.body.data.durationMs).toBeGreaterThan(0);
    });

    it('records error_message on status=error', async () => {
      const startedAt = new Date().toISOString();
      const res = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/agent-steps/${stepId}`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send({
          status: 'error',
          startedAt,
          completedAt: startedAt,
          errorMessage: 'parse failed: malformed XML',
        });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('error');
      expect(res.body.data.errorMessage).toBe('parse failed: malformed XML');
    });
  },
);
