/**
 * REGFlow — Phase D: aggregation by rang.
 *
 * Splits a rule's resolved terms into RHS (rang === 1) and LHS
 * (rang >= 2), then aggregates each side sequentially via the
 * per-term `termOp` (+ - * /). The first term of each side
 * initialises the accumulator with its raw value; every subsequent
 * term applies its operator on the running accumulator.
 *
 * Skip propagation: a single skipped term short-circuits its whole
 * side, the side's `skipReason` carrying the first encountered local
 * skip reason from `resolveTerms`. The other side keeps aggregating
 * independently — Phase E decides whether the rule overall is PASS,
 * FAIL or SKIPPED based on both sides.
 *
 * Division by zero is converted into a `missing_colonne` skip on the
 * affected side; the engine never throws, never produces NaN, never
 * lets Decimal raise a runtime error to the caller.
 *
 * Decimal precision (38 significant digits, ROUND_HALF_EVEN) is
 * inherited from `resolve-terms.ts` which configures it at module
 * load.
 */

import type Decimal from 'decimal.js';

// Side-effect import: resolve-terms.ts owns the Decimal.set() call
// (precision 38, ROUND_HALF_EVEN). Phase D needs that configuration
// for its arithmetic, but only consumes types from resolve-terms.
// Type-only imports are erased at compile time, so we explicitly load
// the module here to force the side-effect to run when phase-d is
// imported in isolation (e.g. by its own test file).
import './resolve-terms.js';
import type { ResolvedTerm, SkipReason } from './resolve-terms.js';

export interface AggregatedResult {
  readonly lhs: Decimal | null;
  readonly rhs: Decimal | null;
  readonly lhsSkipReason: SkipReason | null;
  readonly rhsSkipReason: SkipReason | null;
}

interface SideResult {
  readonly value: Decimal | null;
  readonly skipReason: SkipReason | null;
}

export function aggregateTerms(resolved: readonly ResolvedTerm[]): AggregatedResult {
  const rhsTerms = resolved.filter((r) => r.term.rang === 1);
  const lhsTerms = resolved.filter((r) => r.term.rang >= 2);

  const rhs = aggregateSide(rhsTerms);
  const lhs = aggregateSide(lhsTerms);

  return {
    lhs: lhs.value,
    rhs: rhs.value,
    lhsSkipReason: lhs.skipReason,
    rhsSkipReason: rhs.skipReason,
  };
}

function aggregateSide(terms: readonly ResolvedTerm[]): SideResult {
  if (terms.length === 0) {
    return { value: null, skipReason: null };
  }
  for (const t of terms) {
    if (t.skipReason !== null) {
      return { value: null, skipReason: t.skipReason };
    }
  }
  // All terms have a value. The first term initialises the accumulator;
  // its termOp is intentionally ignored per the AS-IS algorithm.
  let acc: Decimal = terms[0]!.value!;
  for (let i = 1; i < terms.length; i++) {
    const t = terms[i]!;
    const v = t.value!;
    switch (t.term.termOp) {
      case '+':
        acc = acc.plus(v);
        break;
      case '-':
        acc = acc.minus(v);
        break;
      case '*':
        acc = acc.times(v);
        break;
      case '/':
        if (v.isZero()) {
          return { value: null, skipReason: 'missing_colonne' };
        }
        acc = acc.dividedBy(v);
        break;
      case null:
        // A null termOp mid-sequence has no doctrine; the loader
        // currently leaves it null only on terms that come straight
        // from XLSX rows missing OPER_TERM_REGLE. Treat it as an
        // additive identity to keep the aggregation deterministic.
        acc = acc.plus(v);
        break;
    }
  }
  return { value: acc, skipReason: null };
}
