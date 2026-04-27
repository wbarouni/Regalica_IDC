/**
 * REGFlow — Term resolution against the merged CellMatrix.
 *
 * For every RuleTerm of a rule, resolve a Decimal value or emit a local
 * skip reason. The resolver is the bridge between the canonical rule
 * graph and the parsed XML batch; it does no arithmetic, no operator
 * application, and no verdict logic — those live in Phase D and E.
 *
 * Sentinels (ax_origine starting with C or D, or any non-numeric
 * code) are conservatively skipped as `missing_annexe`. The AS-IS
 * implementation only partially supported them; Phase 2-bis will
 * specify their lookup semantics. The conservative skip keeps the
 * engine deterministic and never crashes on a sentinel-bearing rule.
 */

import Decimal from 'decimal.js';
import type { CellMatrix } from '@regflow/bct-xml-parser';

import type { RuleTerm } from './types.js';

// Module-level Decimal configuration. Phase 2 doctrine: 38 significant
// digits with banker's rounding (ROUND_HALF_EVEN). Imported once per
// process, applies globally to every Decimal arithmetic operation.
Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

export type SkipReason = 'missing_annexe' | 'missing_rubrique' | 'missing_colonne' | 'literal';

export interface ResolvedTerm {
  readonly term: RuleTerm;
  readonly value: Decimal | null;
  readonly skipReason: SkipReason | null;
}

const NUMERIC_AX_ORIGINE = /^\d+$/;

export function resolveTerms(terms: readonly RuleTerm[], mergedCells: CellMatrix): ResolvedTerm[] {
  return terms.map((term) => resolveTerm(term, mergedCells));
}

function resolveTerm(term: RuleTerm, mergedCells: CellMatrix): ResolvedTerm {
  if (term.kind === 'literal') {
    return { term, value: term.literalValue, skipReason: null };
  }
  if (term.kind === 'literal_text') {
    return { term, value: null, skipReason: 'literal' };
  }
  // term.kind === 'cell_ref'
  const ax = term.axOrigine;
  if (ax === null || !NUMERIC_AX_ORIGINE.test(ax)) {
    return { term, value: null, skipReason: 'missing_annexe' };
  }
  const annexeMap = mergedCells.get(ax);
  if (!annexeMap) {
    return { term, value: null, skipReason: 'missing_annexe' };
  }
  if (term.rubriqueCode === null) {
    return { term, value: null, skipReason: 'missing_rubrique' };
  }
  const rubriqueMap = annexeMap.get(term.rubriqueCode);
  if (!rubriqueMap) {
    return { term, value: null, skipReason: 'missing_rubrique' };
  }
  if (term.colonne === null) {
    return { term, value: null, skipReason: 'missing_colonne' };
  }
  const value = rubriqueMap.get(term.colonne);
  if (value === undefined) {
    return { term, value: null, skipReason: 'missing_colonne' };
  }
  return { term, value, skipReason: null };
}
