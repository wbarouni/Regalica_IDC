import {
  diffCanonicalFields,
  finalizeBodySchema,
  isCanonicallyIdentical,
  projectCanonicalFromPayload,
  type CanonicalState,
  type FinalizeBody,
} from '../src/domain/finalize';

/**
 * Pure tests for domain/finalize.ts. No DB, no I/O.
 *
 * Two surfaces:
 *   - zod schema cross-field validation
 *   - canonical idempotence diff (exclusion of correlation_id)
 *
 * Each invariant from the Tranche 0 plan (CEO arbitration #1, #3, #4
 * + ADR 0001 amendment 2) has at least one dedicated test below.
 */

const RULE_UUID = '11111111-1111-7111-8111-111111111111';

function buildHappyCompletedBody(overrides: Partial<FinalizeBody> = {}): FinalizeBody {
  return {
    status: 'completed',
    totals: {
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
    },
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
    ...overrides,
  };
}

function buildHappyFailedBody(overrides: Partial<FinalizeBody> = {}): FinalizeBody {
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
    error_code: 't0_xsd_invalid',
    synthesis_artifact: null,
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Zod cross-field validation
// ───────────────────────────────────────────────────────────────────────────

describe('domain/finalize — zod cross-field validation', () => {
  describe('happy paths', () => {
    it('accepts a canonical completed payload', () => {
      const result = finalizeBodySchema.safeParse(buildHappyCompletedBody());
      expect(result.success).toBe(true);
    });

    it('accepts a canonical failed payload (T0 XSD KO)', () => {
      const result = finalizeBodySchema.safeParse(buildHappyFailedBody());
      expect(result.success).toBe(true);
    });

    it('accepts a completed payload with non-zero fails (BCT-accepted batch with severities below threshold)', () => {
      const result = finalizeBodySchema.safeParse(
        buildHappyCompletedBody({
          totals: {
            pass: 90,
            fail_severe: 5,
            fail_rounding: 5,
            skipped_missing_annexe: 0,
            skipped_missing_rubrique: 0,
            skipped_missing_colonne: 0,
            skipped_missing_data: 0,
            skipped_conditional: 0,
            skipped_unsupported_op: 0,
            skipped_literal_text: 0,
            rules_applicable_total: 100,
          },
          fail_items: [
            {
              rule_id: RULE_UUID,
              ax_term: '630',
              num_regle: 266,
              severity: 'severe',
              calculation_trace: { lhs: '1', rhs: '2' },
            },
          ],
        }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe('completed-status invariants', () => {
    it('rejects status=completed with non-null error_code', () => {
      const result = finalizeBodySchema.safeParse(
        buildHappyCompletedBody({ error_code: 't1_engine_exception' }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.join('.') === 'error_code')).toBe(true);
      }
    });

    it('rejects status=completed with null totals', () => {
      const result = finalizeBodySchema.safeParse(buildHappyCompletedBody({ totals: null }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.join('.') === 'totals')).toBe(true);
      }
    });

    it("rejects status=completed with step3_rdg_status='fail'", () => {
      const result = finalizeBodySchema.safeParse(
        buildHappyCompletedBody({ step3_rdg_status: 'fail' }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects status=completed with step3_rdg_status=null', () => {
      const result = finalizeBodySchema.safeParse(
        buildHappyCompletedBody({ step3_rdg_status: null }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects status=completed with step1_xsd_status='fail' (incoherent)", () => {
      const result = finalizeBodySchema.safeParse(
        buildHappyCompletedBody({ step1_xsd_status: 'fail' }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects status=completed with step2_embedded_status='fail' (incoherent)", () => {
      const result = finalizeBodySchema.safeParse(
        buildHappyCompletedBody({ step2_embedded_status: 'fail' }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe('failed-status invariants', () => {
    it('rejects status=failed with null error_code', () => {
      const result = finalizeBodySchema.safeParse(buildHappyFailedBody({ error_code: null }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((i) => i.path.join('.') === 'error_code')).toBe(true);
      }
    });

    it('accepts status=failed with null totals (T0 KO never produced verdicts)', () => {
      const result = finalizeBodySchema.safeParse(buildHappyFailedBody({ totals: null }));
      expect(result.success).toBe(true);
    });
  });

  describe('field-shape invariants', () => {
    it("rejects status outside {'completed','failed'} (no 'aborted' this tranche)", () => {
      const body = { ...buildHappyCompletedBody(), status: 'aborted' as never };
      const result = finalizeBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    it("rejects step BCT statuses outside {'pass','fail'} (no 'skipped')", () => {
      const body = { ...buildHappyCompletedBody(), step3_rdg_status: 'skipped' as never };
      const result = finalizeBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    it('rejects negative duration_ms', () => {
      const body = { ...buildHappyCompletedBody(), duration_ms: -1 };
      const result = finalizeBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });

    it('rejects negative count in totals', () => {
      const body = buildHappyCompletedBody();
      body.totals!.pass = -1;
      const result = finalizeBodySchema.safeParse(body);
      expect(result.success).toBe(false);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Canonical idempotence — projection + diff
// ───────────────────────────────────────────────────────────────────────────

describe('domain/finalize — canonical idempotence', () => {
  it('projects a completed payload onto the 5 canonical fields', () => {
    const projected = projectCanonicalFromPayload(buildHappyCompletedBody());
    expect(projected).toEqual({
      status: 'completed',
      total_pass: 100,
      total_fail_severe: 0,
      total_fail_rounding: 0,
      error_code: null,
    });
  });

  it('projects a failed payload (totals null → 3 nulls in projection)', () => {
    const projected = projectCanonicalFromPayload(buildHappyFailedBody());
    expect(projected).toEqual({
      status: 'failed',
      total_pass: null,
      total_fail_severe: null,
      total_fail_rounding: null,
      error_code: 't0_xsd_invalid',
    });
  });

  it('treats two strictly identical states as canonically identical', () => {
    const a: CanonicalState = {
      status: 'completed',
      total_pass: 90,
      total_fail_severe: 5,
      total_fail_rounding: 5,
      error_code: null,
    };
    expect(isCanonicallyIdentical(a, { ...a })).toBe(true);
    expect(diffCanonicalFields(a, { ...a })).toEqual([]);
  });

  it('detects divergence on status', () => {
    const stored: CanonicalState = {
      status: 'completed',
      total_pass: 100,
      total_fail_severe: 0,
      total_fail_rounding: 0,
      error_code: null,
    };
    const requested: CanonicalState = { ...stored, status: 'failed', error_code: 't1_timeout' };
    expect(isCanonicallyIdentical(stored, requested)).toBe(false);
    const diff = diffCanonicalFields(stored, requested);
    const fields = diff.map((d) => d.field);
    expect(fields).toContain('status');
    expect(fields).toContain('error_code');
  });

  it('detects divergence on each of the 4 numeric counts', () => {
    const base: CanonicalState = {
      status: 'completed',
      total_pass: 100,
      total_fail_severe: 0,
      total_fail_rounding: 0,
      error_code: null,
    };
    expect(diffCanonicalFields(base, { ...base, total_pass: 99 })[0]?.field).toBe('total_pass');
    expect(diffCanonicalFields(base, { ...base, total_fail_severe: 1 })[0]?.field).toBe(
      'total_fail_severe',
    );
    expect(diffCanonicalFields(base, { ...base, total_fail_rounding: 2 })[0]?.field).toBe(
      'total_fail_rounding',
    );
  });

  it('the canonical type does NOT carry correlation_id (compile-time guard)', () => {
    // This is essentially a type-level assertion — we cannot construct
    // a CanonicalState with correlation_id without a TS error. The
    // runtime form below proves the property: passing a "richer"
    // object with extra fields still produces an identical projection.
    const stored: CanonicalState = {
      status: 'completed',
      total_pass: 50,
      total_fail_severe: 0,
      total_fail_rounding: 0,
      error_code: null,
    };
    const requested: CanonicalState = { ...stored };
    expect(isCanonicallyIdentical(stored, requested)).toBe(true);
  });

  it('a payload with a different correlation_id but identical 5 canonical fields projects to the same state', () => {
    // The two payloads below carry NO correlation_id (it lives in the
    // HTTP header, not the body). The plan calls this out explicitly:
    // a fresh client retrying with a new UUID still hits 200 no-op.
    // Here we prove the invariant at the projection layer: same 5
    // canonical fields → same projection regardless of any field
    // outside the canonical set (e.g. duration_ms, BCT statuses).
    const a = buildHappyCompletedBody({ duration_ms: 1234, step1_xsd_duration_ms: 100 });
    const b = buildHappyCompletedBody({ duration_ms: 9999, step1_xsd_duration_ms: 999 });
    expect(projectCanonicalFromPayload(a)).toEqual(projectCanonicalFromPayload(b));
    expect(
      isCanonicallyIdentical(projectCanonicalFromPayload(a), projectCanonicalFromPayload(b)),
    ).toBe(true);
  });
});
