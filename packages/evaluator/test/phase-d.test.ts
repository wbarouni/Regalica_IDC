/**
 * Unit tests for `aggregateTerms`. Pure ResolvedTerm[] inputs built in
 * memory; no DB, no XML, no fixtures.
 */

import Decimal from 'decimal.js';

import { aggregateTerms } from '../src/phase-d.js';
import type { ResolvedTerm, SkipReason } from '../src/resolve-terms.js';
import type { RuleTerm } from '../src/types.js';

function makeTerm(rang: 1 | 2 | 3, numSeq: number, termOp: RuleTerm['termOp']): RuleTerm {
  return {
    id: `t-r${rang}-s${numSeq}`,
    rang,
    numSeq,
    termOp,
    kind: 'cell_ref',
    axOrigine: '00',
    rubriqueCode: 'R',
    colonne: '1',
    literalValue: null,
    literalText: null,
  };
}

function value(
  rang: 1 | 2 | 3,
  numSeq: number,
  termOp: RuleTerm['termOp'],
  raw: string,
): ResolvedTerm {
  return {
    term: makeTerm(rang, numSeq, termOp),
    value: new Decimal(raw),
    skipReason: null,
  };
}

function skip(
  rang: 1 | 2 | 3,
  numSeq: number,
  termOp: RuleTerm['termOp'],
  reason: SkipReason,
): ResolvedTerm {
  return {
    term: makeTerm(rang, numSeq, termOp),
    value: null,
    skipReason: reason,
  };
}

describe('phase-d — aggregateTerms()', () => {
  it('aggregates a simple two-term rule (rang=1 RHS, rang=2 LHS)', () => {
    const result = aggregateTerms([value(1, 1, '+', '100'), value(2, 1, '+', '100')]);
    expect(result.rhs!.toString()).toBe('100');
    expect(result.lhs!.toString()).toBe('100');
    expect(result.rhsSkipReason).toBeNull();
    expect(result.lhsSkipReason).toBeNull();
  });

  it('aggregates an additive multi-term LHS', () => {
    const result = aggregateTerms([
      value(1, 1, '+', '300'),
      value(2, 1, '+', '100'),
      value(2, 2, '+', '50'),
      value(2, 3, '+', '150'),
    ]);
    expect(result.lhs!.toString()).toBe('300');
    expect(result.rhs!.toString()).toBe('300');
  });

  it('aggregates an LHS with subtraction', () => {
    const result = aggregateTerms([
      value(1, 1, '+', '40'),
      value(2, 1, '+', '100'),
      value(2, 2, '-', '60'),
    ]);
    expect(result.lhs!.toString()).toBe('40');
  });

  it('aggregates LHS with multiplication and division', () => {
    const result = aggregateTerms([
      value(1, 1, '+', '0'),
      value(2, 1, '+', '10'),
      value(2, 2, '*', '4'),
      value(2, 3, '/', '2'),
    ]);
    expect(result.lhs!.toString()).toBe('20');
  });

  it('propagates a skip when one RHS term is skipped', () => {
    const result = aggregateTerms([skip(1, 1, '+', 'missing_annexe'), value(2, 1, '+', '100')]);
    expect(result.rhs).toBeNull();
    expect(result.rhsSkipReason).toBe('missing_annexe');
    expect(result.lhs!.toString()).toBe('100');
    expect(result.lhsSkipReason).toBeNull();
  });

  it('propagates a skip when one LHS term is skipped', () => {
    const result = aggregateTerms([
      value(1, 1, '+', '100'),
      value(2, 1, '+', '50'),
      skip(2, 2, '+', 'missing_rubrique'),
      value(2, 3, '+', '50'),
    ]);
    expect(result.lhs).toBeNull();
    expect(result.lhsSkipReason).toBe('missing_rubrique');
    expect(result.rhs!.toString()).toBe('100');
  });

  it('skips with missing_colonne on division by zero', () => {
    const result = aggregateTerms([
      value(1, 1, '+', '10'),
      value(2, 1, '+', '100'),
      value(2, 2, '/', '0'),
    ]);
    expect(result.lhs).toBeNull();
    expect(result.lhsSkipReason).toBe('missing_colonne');
  });

  it('returns lhs=null with no skip when only rang=1 terms exist', () => {
    const result = aggregateTerms([value(1, 1, '+', '42')]);
    expect(result.lhs).toBeNull();
    expect(result.lhsSkipReason).toBeNull();
    expect(result.rhs!.toString()).toBe('42');
    expect(result.rhsSkipReason).toBeNull();
  });

  it('preserves Decimal precision (38 digits) across accumulation', () => {
    const a = '1.0000000000000000000000000000000000001';
    const b = '0.9999999999999999999999999999999999999';
    const result = aggregateTerms([
      value(1, 1, '+', '0'),
      value(2, 1, '+', a),
      value(2, 2, '+', b),
    ]);
    // a + b = 2 (exact in 38-digit precision)
    expect(result.lhs!.toString()).toBe('2');
    expect(Decimal.precision).toBe(38);
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_EVEN);
  });

  it("uses banker's rounding (ROUND_HALF_EVEN) on division", () => {
    // 1/3 with 38 digits → 0.33333... (38 digits)
    const result = aggregateTerms([
      value(1, 1, '+', '0'),
      value(2, 1, '+', '1'),
      value(2, 2, '/', '3'),
    ]);
    const lhs = result.lhs!.toString();
    expect(lhs.startsWith('0.3333333333333333333333333333333333333')).toBe(true);
    expect(lhs.length).toBeGreaterThanOrEqual(38);
  });
});
