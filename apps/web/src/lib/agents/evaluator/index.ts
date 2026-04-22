import Decimal from 'decimal.js';
import { randomUUID } from 'crypto';
import type { EvaluationResult, EvaluationVerdict, RuleWithTerms } from './types';
import { phaseA, phaseB, phaseD, phaseE, resolveTerms } from './phases';

Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

export type { EvaluationResult, EvaluationVerdict, RuleWithTerms };
export { type VerdictStatus } from './types';

export async function runEvaluation(
  xmlFiles: Map<string, string>,
  rules: RuleWithTerms[],
  tenantId: string,
): Promise<EvaluationResult> {
  const startMs = Date.now();
  const runId = randomUUID();
  const cells = phaseA(xmlFiles);
  phaseB(rules);
  const verdicts: EvaluationVerdict[] = [];
  let pass = 0, fail = 0, skip = 0;

  for (const rule of rules) {
    if (!rule.is_active) continue;
    const resolved = resolveTerms(rule.terms, cells);
    const aggResult = phaseD(resolved);
    const verdict = phaseE(rule, aggResult);
    verdicts.push(verdict);
    if (verdict.status === 'PASS') pass++;
    else if (verdict.status === 'FAIL') fail++;
    else skip++;
  }

  void tenantId;
  return { runId, pass, fail, skip, verdicts, durationMs: Date.now() - startMs };
}
