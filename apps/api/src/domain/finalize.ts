/**
 * Finalize payload — zod schema + idempotence diff.
 *
 * Single source of truth for:
 *   1. Cross-field validation of POST /api/engine/runs/:runId/finalize
 *      (CEO arbitration, plan Tranche 0 décision #1 + #3 + #4):
 *        - status='completed' ⇒ step3_rdg_status='pass' AND no earlier
 *          step is 'fail' AND error_code IS NULL
 *        - status='failed'    ⇒ error_code IS NOT NULL (FK-validated
 *          downstream by the route against run_error_codes)
 *        - aborted is out of scope this tranche
 *        - per-step BCT statuses ∈ {'pass','fail'} strict (no 'skipped')
 *
 *   2. Canonical idempotence comparison (CEO arbitration #4 + amendment 2
 *      ADR 0001):
 *        - Compares ONLY the 5 canonical fields:
 *            (status, total_pass, total_fail_severe,
 *             total_fail_rounding, error_code)
 *        - **correlation_id is metadata de traçabilité, EXCLUDED from
 *          the diff.** Same payload with a different correlation_id
 *          must still resolve as canonically identical so a network
 *          retry from a fresh client (with a new UUID) does not
 *          double-emit the SSE complete frame.
 *
 * Pure module: no I/O, no DB, no logging. Safe to import anywhere.
 */

import { z } from 'zod';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// BCT step statuses are binary by doctrine — no 'skipped' value.
// Reused across step1/step2/step3 of the BCT three-step pipeline.
export const bctStepStatusSchema = z.enum(['pass', 'fail']);

// Fail-detail item inserted into validation_fail_details in batch.
// Mirrors the shape already accepted by POST /api/engine/runs/:runId/
// fail-details (engine.ts:49-63) so chatbot-py can reuse the same
// payload shape — no new contract.
export const finalizeFailItemSchema = z.object({
  rule_id: z.string().regex(UUID_RE),
  ax_term: z.string().min(1).max(10),
  num_regle: z.number().int(),
  is_sentinel_iteration: z.boolean().optional(),
  iteration_index: z.number().int().nullable().optional(),
  iteration_xpath: z.string().nullable().optional(),
  iteration_label: z.string().nullable().optional(),
  severity: z.enum(['severe', 'rounding']),
  expected_value: z.number().nullable().optional(),
  computed_value: z.number().nullable().optional(),
  gap_absolute: z.number().nullable().optional(),
  gap_relative: z.number().nullable().optional(),
  calculation_trace: z.unknown(),
});

// Totals — 11 keys mirroring EngineEvaluateTotals (engine.ts:173-185).
// Reused verbatim so chatbot-py forwards what /evaluate returned.
export const finalizeTotalsSchema = z.object({
  pass: z.number().int().nonnegative(),
  fail_severe: z.number().int().nonnegative(),
  fail_rounding: z.number().int().nonnegative(),
  skipped_missing_annexe: z.number().int().nonnegative(),
  skipped_missing_rubrique: z.number().int().nonnegative(),
  skipped_missing_colonne: z.number().int().nonnegative(),
  skipped_missing_data: z.number().int().nonnegative(),
  skipped_conditional: z.number().int().nonnegative(),
  skipped_unsupported_op: z.number().int().nonnegative(),
  skipped_literal_text: z.number().int().nonnegative(),
  rules_applicable_total: z.number().int().nonnegative(),
});

export const finalizeStatusSchema = z.enum(['completed', 'failed']);

const baseFinalizeBodySchema = z.object({
  status: finalizeStatusSchema,
  totals: finalizeTotalsSchema.nullable(),
  fail_items: z.array(finalizeFailItemSchema).optional().default([]),
  duration_ms: z.number().int().nonnegative(),
  step1_xsd_status: bctStepStatusSchema.nullable(),
  step1_xsd_duration_ms: z.number().int().nonnegative().nullable(),
  step2_embedded_status: bctStepStatusSchema.nullable(),
  step2_embedded_duration_ms: z.number().int().nonnegative().nullable(),
  step3_rdg_status: bctStepStatusSchema.nullable(),
  step3_rdg_duration_ms: z.number().int().nonnegative().nullable(),
  error_code: z.string().min(1).nullable(),
  synthesis_artifact: z.record(z.unknown()).nullable().optional(),
});

/**
 * Cross-field validation. Refines the base schema with the doctrine
 * constraints from the Tranche 0 plan (Décision #1 + #3).
 *
 * status='completed' invariants:
 *   - step3_rdg_status MUST be 'pass'
 *   - no earlier step (1 or 2) may be 'fail'
 *   - error_code MUST be null (no error on success)
 *   - totals MUST be present (non-null)
 *
 * status='failed' invariants:
 *   - error_code MUST be present (the route then checks it exists in
 *     run_error_codes via FK; here we only enforce non-null)
 *   - totals MAY be null (T0 KO never produced verdicts)
 */
export const finalizeBodySchema = baseFinalizeBodySchema.superRefine((data, ctx) => {
  if (data.status === 'completed') {
    if (data.error_code !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error_code'],
        message: "status='completed' requires error_code to be null",
      });
    }
    if (data.totals === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totals'],
        message: "status='completed' requires totals to be present",
      });
    }
    if (data.step3_rdg_status !== 'pass') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['step3_rdg_status'],
        message: "status='completed' requires step3_rdg_status='pass'",
      });
    }
    if (data.step1_xsd_status === 'fail') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['step1_xsd_status'],
        message: "status='completed' is incompatible with step1_xsd_status='fail'",
      });
    }
    if (data.step2_embedded_status === 'fail') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['step2_embedded_status'],
        message: "status='completed' is incompatible with step2_embedded_status='fail'",
      });
    }
  } else if (data.status === 'failed') {
    if (data.error_code === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['error_code'],
        message: "status='failed' requires a non-null error_code",
      });
    }
  }
});

export type FinalizeBody = z.infer<typeof finalizeBodySchema>;
export type FinalizeStatus = z.infer<typeof finalizeStatusSchema>;
export type FinalizeTotals = z.infer<typeof finalizeTotalsSchema>;
export type BctStepStatus = z.infer<typeof bctStepStatusSchema>;
export type FinalizeFailItem = z.infer<typeof finalizeFailItemSchema>;

// ───────────────────────────────────────────────────────────────────────────
// Canonical idempotence diff
// ───────────────────────────────────────────────────────────────────────────
//
// CEO arbitration #4 (plan Tranche 0) + amendment 2 (ADR 0001):
// the diff between a stored row and an incoming /finalize payload
// is computed on EXACTLY 5 canonical fields. Every other column
// (correlation_id, completed_at, conformity_rate, totals beyond the
// 4 aggregate counts, BCT step statuses, synthesis_artifact, etc.)
// is EXCLUDED from the canonical comparison.
//
// Rationale for excluding correlation_id specifically:
// a network retry from chatbot-py reuses the same correlation_id, so
// it would always match. But a *different* client (e.g. a manual
// operator replay with a new UUID) re-finalizing with the same payload
// MUST also be a no-op — otherwise we double-emit the SSE 'complete'
// frame and confuse the frontend. Treating correlation_id as metadata
// (not as identity) is the only consistent rule.

export interface CanonicalState {
  status: FinalizeStatus;
  total_pass: number | null;
  total_fail_severe: number | null;
  total_fail_rounding: number | null;
  error_code: string | null;
}

export interface CanonicalFieldDivergence {
  field: keyof CanonicalState;
  stored: unknown;
  requested: unknown;
}

/** Project a finalize payload into the 5-field canonical state. */
export function projectCanonicalFromPayload(payload: FinalizeBody): CanonicalState {
  return {
    status: payload.status,
    total_pass: payload.totals?.pass ?? null,
    total_fail_severe: payload.totals?.fail_severe ?? null,
    total_fail_rounding: payload.totals?.fail_rounding ?? null,
    error_code: payload.error_code,
  };
}

/**
 * True iff the two canonical states match field by field.
 *
 * Used by the /finalize handler after SELECT ... FOR UPDATE on a row
 * already in a terminal status: identical → 200 no-op (no SSE
 * re-emission, no fail_details re-insert), divergent → 409 Conflict.
 *
 * IMPORTANT: this comparison EXCLUDES correlation_id by construction —
 * see the diff helper above.
 */
export function isCanonicallyIdentical(stored: CanonicalState, requested: CanonicalState): boolean {
  return (
    stored.status === requested.status &&
    stored.total_pass === requested.total_pass &&
    stored.total_fail_severe === requested.total_fail_severe &&
    stored.total_fail_rounding === requested.total_fail_rounding &&
    stored.error_code === requested.error_code
  );
}

/**
 * Enumerate every field that diverges between stored and requested.
 * Returns [] when canonically identical. The 409 Conflict body lists
 * the divergent fields explicitly so the operator can reconcile.
 */
export function diffCanonicalFields(
  stored: CanonicalState,
  requested: CanonicalState,
): CanonicalFieldDivergence[] {
  const fields: (keyof CanonicalState)[] = [
    'status',
    'total_pass',
    'total_fail_severe',
    'total_fail_rounding',
    'error_code',
  ];
  const out: CanonicalFieldDivergence[] = [];
  for (const field of fields) {
    if (stored[field] !== requested[field]) {
      out.push({ field, stored: stored[field], requested: requested[field] });
    }
  }
  return out;
}
