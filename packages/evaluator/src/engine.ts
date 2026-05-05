/**
 * REGFlow — RDG Evaluator orchestrator.
 *
 * Drives the full pipeline that turns parsed XMLs and loaded rules
 * into a deterministic `EvaluationResult`. Phase A (XML parsing) is
 * done by the caller via `parseBatch` from this same package; the
 * engine consumes the resulting `parsedXmls` and `mergedCells`
 * directly. The remaining phases run here:
 *
 *   B  groupRulesByAnnexe(rules)
 *   C  resolveTerms(rule.terms, mergedCells)        per rule
 *   D  aggregateTerms(resolved)                     per rule
 *   E  produceVerdict(rule, agg, roundingThreshold) per rule
 *
 * The verdict array is sorted (annexeCode asc, numRegle asc) for
 * bit-stable output across runs and across machines, then summed via
 * `aggregateTotals`.
 *
 * The engine version is read at module load from this package's own
 * package.json — never hardcoded as a string literal in the engine
 * source. The rules and referentials snapshot identifiers are
 * accepted as options because the engine is unaware of how callers
 * (API service, test harness, golden runner) source them; they
 * default to empty strings to satisfy the canonical EvaluationResult
 * contract while leaving the actual provenance to Phase 3.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import type Decimal from 'decimal.js';

import './resolve-terms.js';
import { groupRulesByAnnexe } from './phase-b.js';
import { resolveTerms } from './resolve-terms.js';
import { aggregateTerms } from './phase-d.js';
import { produceVerdict } from './phase-e.js';
import {
  aggregateTotals,
  type EvaluationInput,
  type EvaluationResult,
  type Verdict,
} from './types.js';

const ENGINE_VERSION: string = (() => {
  const pkgPath = resolve(__dirname, '../package.json');
  const raw = readFileSync(pkgPath, 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
})();

/**
 * K4 — progress callback contract.
 *
 * Invoked from inside the evaluation loop with the number of rules
 * already evaluated and the total. Throttled in two complementary
 * ways to keep the cost bounded on a 4611-rule corpus:
 *
 *   - Every `PROGRESS_TICK_RULES` rules (count-based granularity);
 *   - At most every `PROGRESS_TICK_MS` milliseconds (time-based
 *     guard so a fast tick batch does not flood the bus).
 *
 * The very first tick always fires (so the consumer sees 0% as
 * soon as the loop starts) and a terminal tick always fires (so
 * the consumer reads 100% before the function returns). Between
 * those, the throttle picks the first of the two thresholds.
 *
 * Optional: omitting it preserves the pre-K4 behaviour bit-for-bit.
 */
export type RunEvaluationProgressCallback = (rulesEvaluated: number, rulesTotal: number) => void;

const PROGRESS_TICK_RULES = 50;
const PROGRESS_TICK_MS = 500;

export interface RunEvaluationOptions {
  readonly roundingThreshold?: Decimal;
  readonly rulesVersionSnapshot?: string;
  readonly referentialsVersionSnapshot?: string;
  readonly onProgress?: RunEvaluationProgressCallback;
}

export async function runEvaluation(
  input: EvaluationInput,
  options?: RunEvaluationOptions,
): Promise<EvaluationResult> {
  const startedAt = Date.now();

  const groups = groupRulesByAnnexe(input.rules);
  const verdicts: Verdict[] = [];

  const onProgress = options?.onProgress;
  const rulesTotal = input.rules.length;
  let evaluated = 0;
  let lastTickAt = startedAt;
  if (onProgress !== undefined) {
    // K4 — initial tick at 0% so the consumer can switch a hidden
    // bar on as soon as the first frame fires; idempotent, never
    // double-emits because we only call onProgress here once.
    onProgress(0, rulesTotal);
  }

  for (const bucket of groups.values()) {
    for (const rule of bucket) {
      const resolved = resolveTerms(rule.terms, input.mergedCells);
      const agg = aggregateTerms(resolved);
      const verdict = produceVerdict(rule, agg, options?.roundingThreshold);
      verdicts.push(verdict);
      evaluated += 1;
      if (onProgress !== undefined && evaluated < rulesTotal) {
        const now = Date.now();
        if (evaluated % PROGRESS_TICK_RULES === 0 || now - lastTickAt >= PROGRESS_TICK_MS) {
          onProgress(evaluated, rulesTotal);
          lastTickAt = now;
        }
      }
    }
  }
  if (onProgress !== undefined && rulesTotal > 0) {
    // K4 — terminal tick at 100% so the consumer is guaranteed a
    // final frame independent of the throttle alignment. Skipped
    // when rulesTotal is 0 (the initial 0/0 tick already covered it).
    onProgress(rulesTotal, rulesTotal);
  }

  verdicts.sort((a, b) => {
    if (a.annexeCode !== b.annexeCode) {
      return a.annexeCode < b.annexeCode ? -1 : 1;
    }
    return a.numRegle - b.numRegle;
  });

  const totals = aggregateTotals(verdicts);
  const durationMs = Date.now() - startedAt;

  return {
    runId: randomUUID(),
    tenantId: input.tenantId,
    arreteDate: input.arreteDate,
    totals,
    verdicts,
    durationMs,
    enginVersion: ENGINE_VERSION,
    rulesVersionSnapshot: options?.rulesVersionSnapshot ?? '',
    referentialsVersionSnapshot: options?.referentialsVersionSnapshot ?? '',
  };
}
