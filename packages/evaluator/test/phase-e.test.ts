/**
 * Unit tests for `produceVerdict`. Pure inputs built in memory; no DB,
 * no XML, no fixtures.
 */

import Decimal from 'decimal.js';

import { produceVerdict } from '../src/phase-e.js';
import type { AggregatedResult } from '../src/phase-d.js';
import type { SkipReason } from '../src/resolve-terms.js';
import type { RuleWithTerms } from '../src/types.js';

function makeRule(operRegle: RuleWithTerms['operRegle']): RuleWithTerms {
  return {
    id: 'rule-x',
    tenantId: 't',
    axTerm: '00',
    numRegle: 1,
    operRegle,
    typeCtrl: 'intra_ax',
    domaine: null,
    libAnnexe: null,
    zoneTexte: null,
    isFormalized: true,
    version: 1,
    validFrom: '2025-01-01T00:00:00.000Z',
    validTo: null,
    terms: [],
  };
}

function agg(
  lhs: string | null,
  rhs: string | null,
  lhsSkipReason: SkipReason | null = null,
  rhsSkipReason: SkipReason | null = null,
): AggregatedResult {
  return {
    lhs: lhs === null ? null : new Decimal(lhs),
    rhs: rhs === null ? null : new Decimal(rhs),
    lhsSkipReason,
    rhsSkipReason,
  };
}

describe('phase-e — produceVerdict()', () => {
  it('returns PASS on exact equality (=)', () => {
    const v = produceVerdict(makeRule('='), agg('100', '100'));
    expect(v.status).toBe('PASS');
    expect(v.severity).toBeNull();
    expect(v.gap).toBeNull();
  });

  it('returns FAIL severe when gap >= threshold (default 1)', () => {
    const v = produceVerdict(makeRule('='), agg('110', '100'));
    expect(v.status).toBe('FAIL');
    expect(v.severity).toBe('severe');
    expect(v.gap!.toString()).toBe('10');
  });

  it('returns FAIL rounding when gap < threshold (default 1)', () => {
    const v = produceVerdict(makeRule('='), agg('100.5', '100'));
    expect(v.status).toBe('FAIL');
    expect(v.severity).toBe('rounding');
    expect(v.gap!.toString()).toBe('0.5');
  });

  it('returns PASS on >= when lhs > rhs', () => {
    const v = produceVerdict(makeRule('>='), agg('150', '100'));
    expect(v.status).toBe('PASS');
  });

  it('returns FAIL on >= when lhs < rhs', () => {
    const v = produceVerdict(makeRule('>='), agg('50', '100'));
    expect(v.status).toBe('FAIL');
    expect(v.severity).toBe('severe');
  });

  it('propagates SKIPPED_MISSING_ANNEXE from lhsSkipReason', () => {
    const v = produceVerdict(makeRule('='), agg(null, '100', 'missing_annexe', null));
    expect(v.status).toBe('SKIPPED_MISSING_ANNEXE');
    expect(v.severity).toBeNull();
    expect(v.gap).toBeNull();
  });

  it('propagates SKIPPED_MISSING_RUBRIQUE from rhsSkipReason', () => {
    const v = produceVerdict(makeRule('='), agg('100', null, null, 'missing_rubrique'));
    expect(v.status).toBe('SKIPPED_MISSING_RUBRIQUE');
  });

  it('returns PASS on VA regardless of values', () => {
    const v = produceVerdict(makeRule('VA'), agg('1', '999999'));
    expect(v.status).toBe('PASS');
  });

  it('returns PASS on SUM when lhs equals rhs', () => {
    const v = produceVerdict(makeRule('SUM'), agg('300', '300'));
    expect(v.status).toBe('PASS');
  });

  it('computes gap as the absolute value of (lhs - rhs)', () => {
    const v = produceVerdict(makeRule('='), agg('80', '100'));
    expect(v.gap!.toString()).toBe('20');
  });

  it('honours a custom roundingThreshold', () => {
    // gap = 5, custom threshold = 10 → severity should be rounding
    const v = produceVerdict(makeRule('='), agg('105', '100'), new Decimal('10'));
    expect(v.status).toBe('FAIL');
    expect(v.severity).toBe('rounding');

    // gap = 5, custom threshold = 1 → severity should be severe
    const v2 = produceVerdict(makeRule('='), agg('105', '100'), new Decimal('1'));
    expect(v2.severity).toBe('severe');
  });

  it('emits severity=null on PASS and on SKIPPED', () => {
    const pass = produceVerdict(makeRule('='), agg('100', '100'));
    expect(pass.severity).toBeNull();

    const skipped = produceVerdict(makeRule('='), agg(null, '100', 'missing_colonne', null));
    expect(skipped.severity).toBeNull();
  });

  it('returns SKIPPED_CONDITIONAL when one side is null without skip reason', () => {
    // Phase D yields lhs=null, no skip, when only rang=1 terms exist.
    const v = produceVerdict(makeRule('='), agg(null, '100'));
    expect(v.status).toBe('SKIPPED_CONDITIONAL');
  });

  it('preserves rule metadata (ruleId, axTerm, numRegle, operRegle) in verdict', () => {
    const rule = makeRule('=');
    const v = produceVerdict(rule, agg('100', '100'));
    expect(v.ruleId).toBe(rule.id);
    expect(v.annexeCode).toBe(rule.axTerm);
    expect(v.numRegle).toBe(rule.numRegle);
    expect(v.operRegle).toBe(rule.operRegle);
  });
});
