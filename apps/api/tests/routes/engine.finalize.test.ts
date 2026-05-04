import jwt from 'jsonwebtoken';
import request from 'supertest';

import { config } from '../../src/config.js';
import { subscribeRunEvents, type RunEventPayload } from '../../src/lib/runEventBus.js';

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

interface SeededRun {
  runId: string;
  uploadId: string;
}

/** Insert the minimum schema graph required by /finalize: an
 *  xml_uploads row + a validation_runs row in status='running'.
 *  Column names match migration 024 verbatim (code_annexe, date_annexe,
 *  uploaded_by_user_id, file_hash_sha256, code_banque). */
async function seedRun(ctx: RoutesTestContext): Promise<SeededRun> {
  const upload = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO xml_uploads (
        tenant_id, code_banque, code_annexe, date_annexe,
        file_name, file_size_bytes, file_hash_sha256,
        content_compressed, compression_algo, encoding_detected,
        uploaded_by_user_id
      )
      VALUES (
        $1, 'BANK-CODE', '00', '2026-02-28',
        'test.xml', 100, ${`'${'a'.repeat(64)}'`},
        decode('1f8b08000000000000', 'hex'), 'gzip', 'utf-8',
        $2
      )
      RETURNING id`,
    [ctx.tenantId, ctx.userId],
  );
  const uploadId = upload.rows[0]!.id;
  const run = await ctx.testPool.query<{ id: string }>(
    `INSERT INTO validation_runs (
        tenant_id, primary_annexe_code, arrete_date, primary_upload_id,
        initiated_by_user_id, rules_version_snapshot,
        referentials_version_snapshot, engine_version, status
      )
      VALUES (
        $1, '00', '2026-02-28', $2,
        $3, '{}'::jsonb, '{}'::jsonb, 'engine-test', 'running'
      )
      RETURNING id`,
    [ctx.tenantId, uploadId, ctx.userId],
  );
  return { runId: run.rows[0]!.id, uploadId };
}

const HAPPY_TOTALS = {
  pass: 100,
  fail_severe: 0,
  fail_rounding: 0,
  skipped_missing_annexe: 0,
  skipped_missing_rubrique: 0,
  skipped_missing_colonne: 0,
  skipped_missing_data: 0,
  skipped_conditional: 0,
  skipped_unsupported_op: 0,
  skipped_literal_text: 0,
  rules_applicable_total: 100,
};

function happyCompletedBody(): Record<string, unknown> {
  return {
    status: 'completed',
    totals: HAPPY_TOTALS,
    fail_items: [],
    duration_ms: 1234,
    step1_xsd_status: 'pass',
    step1_xsd_duration_ms: 100,
    step2_embedded_status: 'pass',
    step2_embedded_duration_ms: 200,
    step3_rdg_status: 'pass',
    step3_rdg_duration_ms: 800,
    error_code: null,
    synthesis_artifact: null,
  };
}

function happyFailedBody(errorCode = 't0_xsd_invalid'): Record<string, unknown> {
  return {
    status: 'failed',
    totals: null,
    fail_items: [],
    duration_ms: 50,
    step1_xsd_status: 'fail',
    step1_xsd_duration_ms: 50,
    step2_embedded_status: null,
    step2_embedded_duration_ms: null,
    step3_rdg_status: null,
    step3_rdg_duration_ms: null,
    error_code: errorCode,
    synthesis_artifact: null,
  };
}

interface CapturedEvent {
  type: RunEventPayload extends infer P ? unknown : never;
}

/** Subscribe to a run's SSE channel for the duration of `fn`, collect
 *  every event payload, and return the captured array. */
async function withSseCollector<T>(
  runId: string,
  fn: () => Promise<T>,
): Promise<{ result: T; events: Array<{ type: string; payload: unknown }> }> {
  const events: Array<{ type: string; payload: unknown }> = [];
  const unsubscribe = subscribeRunEvents(runId, (e) => {
    events.push({ type: e.type, payload: e.payload });
  });
  try {
    const result = await fn();
    // Allow microtask drain so synchronous emit() calls land in `events`.
    await new Promise((resolve) => setImmediate(resolve));
    return { result, events };
  } finally {
    unsubscribe();
  }
}

describeIfDb('routes — engine /runs/:runId/finalize', () => {
  let ctx: RoutesTestContext;

  beforeAll(async () => {
    ctx = await setupRoutesContext(73);
  }, 120000);

  afterAll(async () => {
    await teardownRoutesContext(ctx);
  });

  // ──────────────────────────────────────────────────────────────────
  // Auth + input validation
  // ──────────────────────────────────────────────────────────────────

  it('rejects without Authorization header (401 MISSING_BEARER)', async () => {
    const { runId } = await seedRun(ctx);
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/finalize`)
      .send(happyCompletedBody());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MISSING_BEARER');
  });

  it('rejects malformed runId (400 INVALID_RUN_ID)', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/not-a-uuid/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send(happyCompletedBody());
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RUN_ID');
  });

  it("rejects status='completed' with non-null error_code (422 INVALID_FINALIZE_BODY)", async () => {
    const { runId } = await seedRun(ctx);
    const body = { ...happyCompletedBody(), error_code: 't1_engine_exception' };
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_FINALIZE_BODY');
  });

  it('rejects an unknown error_code (422 UNKNOWN_ERROR_CODE)', async () => {
    const { runId } = await seedRun(ctx);
    const body = happyFailedBody('totally_invented_code');
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNKNOWN_ERROR_CODE');
  });

  it('returns 404 RUN_NOT_FOUND for an unknown runId', async () => {
    const res = await request(ctx.app)
      .post(`/api/engine/runs/00000000-0000-7000-8000-000000000000/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send(happyCompletedBody());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RUN_NOT_FOUND');
  });

  // ──────────────────────────────────────────────────────────────────
  // Happy path — completed
  // ──────────────────────────────────────────────────────────────────

  it("status='completed' updates validation_runs + emits exactly one SSE complete event", async () => {
    const { runId } = await seedRun(ctx);
    const { result: res, events } = await withSseCollector(runId, async () => {
      return request(ctx.app)
        .post(`/api/engine/runs/${runId}/finalize`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send(happyCompletedBody());
    });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');

    // DB assertions
    const { rows } = await ctx.testPool.query<{
      status: string;
      total_pass: number;
      total_fail_severe: number;
      total_fail_rounding: number;
      total_rules_evaluated: number;
      conformity_rate: string | null;
      step1_xsd_status: string | null;
      step3_rdg_status: string | null;
      completed_at: Date | null;
      error_code: string | null;
    }>(
      `SELECT status, total_pass, total_fail_severe, total_fail_rounding,
              total_rules_evaluated, conformity_rate,
              step1_xsd_status, step3_rdg_status, completed_at, error_code
         FROM validation_runs WHERE id = $1`,
      [runId],
    );
    const row = rows[0]!;
    expect(row.status).toBe('completed');
    expect(row.total_pass).toBe(100);
    expect(row.total_fail_severe).toBe(0);
    expect(row.total_fail_rounding).toBe(0);
    expect(row.total_rules_evaluated).toBe(100);
    // NUMERIC(5,4) returns as string in pg driver — parse to compare.
    expect(Number.parseFloat(row.conformity_rate ?? '0')).toBe(1);
    expect(row.step1_xsd_status).toBe('pass');
    expect(row.step3_rdg_status).toBe('pass');
    expect(row.completed_at).not.toBeNull();
    expect(row.error_code).toBeNull();

    // SSE assertions
    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(1);
    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(0);
  });

  it('persists fail_items via the bulk INSERT path', async () => {
    const { runId } = await seedRun(ctx);
    // validation_fail_details.rule_id has a NOT NULL FK to rules(id).
    // Seed a minimal rules row using the canonical column shape from
    // migration 022. We cannot reuse a 4-eyes 'active' status without
    // also satisfying ck_four_eyes (validator distinct from author),
    // so seed a draft row — fail_details FK has no status filter.
    const ruleIns = await ctx.testPool.query<{ id: string }>(
      `INSERT INTO rules (
          tenant_id, ax_term, num_regle,
          type_ctrl_computed, operator, natural_language,
          terms, terms_count, is_inter_annexe, involved_annexes,
          valid_from, author_user_id, status
        )
        VALUES (
          $1, '00', 1,
          'intra_ax', '=', 'Test rule for fail-details FK',
          '[]'::jsonb, 0, FALSE, ARRAY['00']::TEXT[],
          NOW(), $2, 'draft'
        )
        RETURNING id`,
      [ctx.tenantId, ctx.userId],
    );
    const ruleId = ruleIns.rows[0]!.id;

    const body = {
      ...happyCompletedBody(),
      totals: { ...HAPPY_TOTALS, pass: 99, fail_severe: 1, rules_applicable_total: 100 },
      fail_items: [
        {
          rule_id: ruleId,
          ax_term: '00',
          num_regle: 1,
          severity: 'severe',
          calculation_trace: { lhs: '100', rhs: '99' },
        },
      ],
    };
    const res = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send(body);
    expect(res.status).toBe(200);

    const { rows } = await ctx.testPool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM validation_fail_details WHERE validation_run_id = $1`,
      [runId],
    );
    expect(rows[0]!.count).toBe('1');
  });

  // ──────────────────────────────────────────────────────────────────
  // Happy path — failed
  // ──────────────────────────────────────────────────────────────────

  it("status='failed' updates validation_runs + emits exactly one SSE error event", async () => {
    const { runId } = await seedRun(ctx);
    const { result: res, events } = await withSseCollector(runId, async () => {
      return request(ctx.app)
        .post(`/api/engine/runs/${runId}/finalize`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send(happyFailedBody('t0_xsd_invalid'));
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('failed');

    const { rows } = await ctx.testPool.query<{
      status: string;
      error_code: string;
      completed_at: Date | null;
    }>(
      `SELECT status, error_code, completed_at
         FROM validation_runs WHERE id = $1`,
      [runId],
    );
    expect(rows[0]!.status).toBe('failed');
    expect(rows[0]!.error_code).toBe('t0_xsd_invalid');
    expect(rows[0]!.completed_at).not.toBeNull();

    const errorEvents = events.filter((e) => e.type === 'error');
    expect(errorEvents).toHaveLength(1);
    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────
  // Idempotence (CEO décision #4 + ADR 0001)
  // ──────────────────────────────────────────────────────────────────

  it('idempotent no-op: identical canonical payload twice → 200 + 200, single SSE complete', async () => {
    const { runId } = await seedRun(ctx);
    const body = happyCompletedBody();

    const { result, events } = await withSseCollector(runId, async () => {
      const r1 = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/finalize`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send(body);
      const r2 = await request(ctx.app)
        .post(`/api/engine/runs/${runId}/finalize`)
        .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
        .send(body);
      return { r1, r2 };
    });

    expect(result.r1.status).toBe(200);
    expect(result.r2.status).toBe(200);
    expect(result.r2.body.data.idempotent).toBe(true);

    // SSE complete fired ONCE despite two POSTs.
    const completeEvents = events.filter((e) => e.type === 'complete');
    expect(completeEvents).toHaveLength(1);
  });

  it('canonical exclusion: same 5 fields with different X-Correlation-Id → 200 no-op', async () => {
    const { runId } = await seedRun(ctx);
    const body = happyCompletedBody();
    // ADR 0001: correlation_id is metadata, EXCLUDED from the canonical
    // diff. A second client retrying with a fresh UUID must still hit
    // the no-op path.
    const r1 = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .set('X-Correlation-Id', '11111111-1111-4111-8111-111111111111')
      .send(body);
    const r2 = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .set('X-Correlation-Id', '22222222-2222-4222-8222-222222222222')
      .send(body);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body.data.idempotent).toBe(true);
  });

  it('conflict 409: divergent canonical payload on already-terminal run', async () => {
    const { runId } = await seedRun(ctx);
    const body1 = happyCompletedBody();
    const body2 = {
      ...happyCompletedBody(),
      totals: { ...HAPPY_TOTALS, pass: 50, fail_severe: 50, rules_applicable_total: 100 },
    };
    const r1 = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send(body1);
    expect(r1.status).toBe(200);

    const r2 = await request(ctx.app)
      .post(`/api/engine/runs/${runId}/finalize`)
      .set('Authorization', `Bearer ${engineToken(ctx.tenantId)}`)
      .send(body2);
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe('FINALIZE_CONFLICT');
    const fields: string[] = (r2.body.error.divergent as Array<{ field: string }>).map(
      (d) => d.field,
    );
    expect(fields).toContain('total_pass');
    expect(fields).toContain('total_fail_severe');
  });
});
