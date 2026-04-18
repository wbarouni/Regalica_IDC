import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';

import type { EvaluationResult, EvaluationVerdict, RuleWithTerms } from './types';
import { phaseA, phaseB, phaseD, phaseE, resolveTerms } from './phases';

Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

export type { EvaluationResult, EvaluationVerdict, RuleWithTerms };
export { type VerdictStatus } from './types';

/**
 * Run the 5-phase BCT evaluation engine.
 *
 * @param xmlFiles  Map of annexeCode → raw XML string
 * @param rules     Rules with their terms loaded from the DB
 * @param tenantId  Tenant UUID (stored on the run record)
 */
export async function runEvaluation(
  xmlFiles: Map<string, string>,
  rules: RuleWithTerms[],
  tenantId: string,
): Promise<EvaluationResult> {
  const startMs = Date.now();
  const runId = randomUUID();

  // Phase A — parse all XML files
  const cells = phaseA(xmlFiles);

  // Phase B — group rules (not strictly needed for single-pass but kept per spec)
  phaseB(rules); // groups available for future use

  const verdicts: EvaluationVerdict[] = [];
  let pass = 0;
  let fail = 0;
  let skip = 0;

  // Process each active rule
  for (const rule of rules) {
    if (!rule.is_active) continue;

    // Phase C — resolve terms
    const resolved = resolveTerms(rule.terms, cells);

    // Phase D — aggregate by rang
    const aggResult = phaseD(resolved);

    // Phase E — compare & produce verdict
    const verdict = phaseE(rule, aggResult);
    verdicts.push(verdict);

    if (verdict.status === 'PASS') pass++;
    else if (verdict.status === 'FAIL') fail++;
    else skip++;
  }

  void tenantId; // used by caller to associate the run in DB

  return {
    runId,
    pass,
    fail,
    skip,
    verdicts,
    durationMs: Date.now() - startMs,
  };
}
