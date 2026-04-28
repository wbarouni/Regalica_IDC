import request from 'supertest';

import { setupRoutesContext, teardownRoutesContext, type RoutesTestContext } from './_setup.js';

const hasDb = Boolean(process.env['DATABASE_URL']);
const describeIfDb = hasDb ? describe : describe.skip;

describeIfDb('routes — workspace', () => {
  let ctx: RoutesTestContext;
  let runId: string;

  beforeAll(async () => {
    ctx = await setupRoutesContext(47);

    // RLS-protected inserts: open a transaction, set the GUCs, then insert.
    const seed = ctx.testPool;
    const client = await seed.connect();
    try {
      await client.query(`SET search_path TO ${ctx.schemaName}, public`);
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant_id = '${ctx.tenantId}'`);
      await client.query(`SET LOCAL app.current_user_id = '${ctx.userId}'`);

      const upload = await client.query<{ id: string }>(
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

      const runRes = await client.query<{ id: string }>(
        `INSERT INTO validation_runs
           (tenant_id, primary_annexe_code, arrete_date, primary_upload_id,
            initiated_by_user_id, rules_version_snapshot,
            referentials_version_snapshot, engine_version, status,
            total_rules_evaluated, total_pass, total_fail_severe,
            total_fail_rounding, conformity_rate, completed_at)
         VALUES ($1, 'RSM630', '2024-03-31', $2, $3,
                 '{"rules":[]}'::jsonb, '{"refs":[]}'::jsonb,
                 '0.1.0', 'completed', 1245, 1243, 2, 1, 0.9984, NOW())
         RETURNING id`,
        [ctx.tenantId, uploadId, ctx.userId],
      );
      runId = runRes.rows[0]!.id;

      // active rules need validator != author -> create a second user.
      const validator = await client.query<{ id: string }>(
        `INSERT INTO users (tenant_id, external_sso_id, email, full_name)
           VALUES ($1, 'sso-validator-ws', 'val-ws@tenant-001.example', 'ValWS')
           RETURNING id`,
        [ctx.tenantId],
      );
      const validatorId = validator.rows[0]!.id;

      const ruleIds: string[] = [];
      for (const numRegle of [100, 101, 102]) {
        const r = await client.query<{ id: string }>(
          `INSERT INTO rules
             (tenant_id, ax_term, num_regle, type_ctrl_computed, operator,
              natural_language, terms, terms_count, is_inter_annexe,
              involved_annexes, valid_from, author_user_id, status,
              validator_user_id, validated_at)
           VALUES ($1, 'RSM630', $2, 'intra_ax', '=',
                   'rule label', '[]'::jsonb, 0, false,
                   ARRAY['RSM630'], '2024-01-01', $3, 'active',
                   $4, NOW())
           RETURNING id`,
          [ctx.tenantId, numRegle, ctx.userId, validatorId],
        );
        ruleIds.push(r.rows[0]!.id);
      }

      const severities: Array<'severe' | 'rounding'> = ['severe', 'severe', 'rounding'];
      for (let i = 0; i < ruleIds.length; i++) {
        await client.query(
          `INSERT INTO validation_fail_details
             (tenant_id, validation_run_id, rule_id, ax_term, num_regle,
              severity, expected_value, computed_value, gap_absolute,
              calculation_trace)
           VALUES ($1, $2, $3, 'RSM630', $4, $5, 100, 90, 10, '{}'::jsonb)`,
          [ctx.tenantId, runId, ruleIds[i], 100 + i, severities[i]],
        );
      }

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
    const res = await request(ctx.app).get(`/api/tenants/${ctx.tenantId}/runs/current`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_USER_ID');
  });

  it('rejects malformed tenantId (400)', async () => {
    const res = await request(ctx.app)
      .get('/api/tenants/not-a-uuid/runs/current')
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TENANT_ID');
  });

  it('returns the current run for the tenant (200)', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/runs/current`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.data.run_id).toBe(runId);
    expect(res.body.data.total_rules_evaluated).toBe(1245);
    expect(res.body.data.total_fail_severe).toBe(2);
  });

  it('summary returns pass_per_annexe_available=false in meta', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/runs/${runId}/summary`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.pass_per_annexe_available).toBe(false);
    expect(Array.isArray(res.body.data.annexes)).toBe(true);
    const rsm = res.body.data.annexes[0];
    expect(rsm.code).toBe('RSM630');
    expect(Number(rsm.fail_severe)).toBe(2);
    expect(Number(rsm.fail_rounding)).toBe(1);
    expect(Number(rsm.total_fail)).toBe(3);
  });

  it('agents endpoint returns 501 (table not implemented)', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/runs/${runId}/agents`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
  });

  it('fails endpoint rejects filter=pass with 400', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/runs/${runId}/fails?filter=pass`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILTER_NOT_SUPPORTED');
  });

  it('fails endpoint paginates and orders severe before rounding', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/runs/${runId}/fails?limit=10`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.pass_persisted).toBe(false);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data[0].severity).toBe('severe');
    expect(res.body.data[2].severity).toBe('rounding');
  });

  it('fails filter=fail returns only severe', async () => {
    const res = await request(ctx.app)
      .get(`/api/tenants/${ctx.tenantId}/runs/${runId}/fails?filter=fail`)
      .set('X-User-Id', ctx.userId);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((r: { severity: string }) => r.severity === 'severe')).toBe(true);
  });
});
