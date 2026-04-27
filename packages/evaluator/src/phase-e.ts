/**
 * REGFlow — Phase E: comparison and verdict.
 *
 * Compares the LHS to the RHS produced by Phase D using the rule's
 * `operRegle`, then emits a final `Verdict` with PASS / FAIL / SKIPPED
 * status. Also computes the gap and the FailSeverity (severe vs
 * rounding) on FAIL.
 *
 * Skip propagation: if either side carries a SkipReason from
 * resolveTerms, the verdict short-circuits to the corresponding
 * VerdictStatus. LHS skips take precedence over RHS skips because
 * the LHS is what the rule asserts about; an absent LHS tells the
 * investigator more than an absent RHS.
 *
 * Rounding threshold is parametric (default Decimal('1')). Phase 3
 * will fetch the actual TND threshold from `referentials_sentinels`
 * and pass it as `roundingThreshold`. The default lives on a
 * module-level Decimal so it is constructed once per process.
 */

import Decimal from 'decimal.js';

// Side-effect import: ensures Decimal.set() runs (precision 38,
// ROUND_HALF_EVEN) even when phase-e is loaded in isolation.
import './resolve-terms.js';
import type { AggregatedResult } from './phase-d.js';
import type { SkipReason } from './resolve-terms.js';
import type { FailSeverity, RuleWithTerms, Verdict, VerdictStatus } from './types.js';

const DEFAULT_ROUNDING_THRESHOLD = new Decimal('1');

function mapSkipReason(reason: SkipReason): VerdictStatus {
  switch (reason) {
    case 'missing_annexe':
      return 'SKIPPED_MISSING_ANNEXE';
    case 'missing_rubrique':
      return 'SKIPPED_MISSING_RUBRIQUE';
    case 'missing_colonne':
      return 'SKIPPED_MISSING_COLONNE';
    case 'literal':
      return 'SKIPPED_LITERAL_TEXT';
  }
}

export function produceVerdict(
  rule: RuleWithTerms,
  agg: AggregatedResult,
  roundingThreshold?: Decimal,
): Verdict {
  const threshold = roundingThreshold ?? DEFAULT_ROUNDING_THRESHOLD;

  if (agg.lhsSkipReason !== null) {
    return makeSkipVerdict(rule, agg, mapSkipReason(agg.lhsSkipReason));
  }
  if (agg.rhsSkipReason !== null) {
    return makeSkipVerdict(rule, agg, mapSkipReason(agg.rhsSkipReason));
  }

  // VA evaluates as PASS regardless of side values — the operator
  // attests that the cell carries a documentary value not subject to
  // arithmetic comparison.
  if (rule.operRegle === 'VA') {
    return makePassVerdict(rule, agg);
  }

  // For every other operator, both LHS and RHS must be present.
  // An absent side without a skip reason means the rule has no
  // applicable terms on that side — treat as conditional skip so the
  // verdict trail is explicit.
  if (agg.rhs === null || agg.lhs === null) {
    return makeSkipVerdict(rule, agg, 'SKIPPED_CONDITIONAL');
  }

  const lhs = agg.lhs;
  const rhs = agg.rhs;

  let isPass: boolean;
  switch (rule.operRegle) {
    case '=':
    case 'SUM':
    case 'MAX':
    case 'MIN':
      // SUM, MAX, MIN: in the AS-IS, the LHS aggregation is supposed
      // to already encode the SUM/MAX/MIN semantics across rang>=2
      // terms. Comparing equality with the RHS is the conservative
      // verdict; a richer interpretation is deferred to Phase 2-bis
      // when the term-level data is exposed alongside the aggregate.
      isPass = lhs.equals(rhs);
      break;
    case '>=':
      isPass = lhs.gte(rhs);
      break;
    case '<=':
      isPass = lhs.lte(rhs);
      break;
    case '>':
      isPass = lhs.gt(rhs);
      break;
    case '<':
      isPass = lhs.lt(rhs);
      break;
  }

  if (isPass) {
    return makePassVerdict(rule, agg);
  }

  const gap = lhs.minus(rhs).abs();
  const severity: FailSeverity = gap.lt(threshold) ? 'rounding' : 'severe';
  return {
    ruleId: rule.id,
    annexeCode: rule.axTerm,
    numRegle: rule.numRegle,
    operRegle: rule.operRegle,
    status: 'FAIL',
    severity,
    lhs,
    rhs,
    gap,
    skipReason: null,
    rubriqueAt: null,
    colonneAt: null,
  };
}

function makeSkipVerdict(
  rule: RuleWithTerms,
  agg: AggregatedResult,
  status: VerdictStatus,
): Verdict {
  return {
    ruleId: rule.id,
    annexeCode: rule.axTerm,
    numRegle: rule.numRegle,
    operRegle: rule.operRegle,
    status,
    severity: null,
    lhs: agg.lhs,
    rhs: agg.rhs,
    gap: null,
    skipReason: status,
    rubriqueAt: null,
    colonneAt: null,
  };
}

function makePassVerdict(rule: RuleWithTerms, agg: AggregatedResult): Verdict {
  return {
    ruleId: rule.id,
    annexeCode: rule.axTerm,
    numRegle: rule.numRegle,
    operRegle: rule.operRegle,
    status: 'PASS',
    severity: null,
    lhs: agg.lhs,
    rhs: agg.rhs,
    gap: null,
    skipReason: null,
    rubriqueAt: null,
    colonneAt: null,
  };
}
