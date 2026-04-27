/**
 * Unit tests for `groupRulesByAnnexe`. Pure in-memory — no DB, no FS.
 */

import { groupRulesByAnnexe } from '../src/phase-b.js';
import type { RuleWithTerms, RuleTerm } from '../src/types.js';

function makeTerm(rang: 1 | 2 | 3, numSeq: number, axOrigine: string | null): RuleTerm {
  return {
    id: `term::r${rang}::s${numSeq}`,
    rang,
    numSeq,
    termOp: '+',
    kind: 'cell_ref',
    axOrigine,
    rubriqueCode: 'R000',
    colonne: '1',
    literalValue: null,
    literalText: null,
  };
}

function makeRule(
  id: string,
  axTerm: string,
  numRegle: number,
  termAxOrigines: (string | null)[],
): RuleWithTerms {
  return {
    id,
    tenantId: 't',
    axTerm,
    numRegle,
    operRegle: '=',
    typeCtrl: termAxOrigines.some((ax) => ax !== null && ax !== axTerm) ? 'inter_ax' : 'intra_ax',
    domaine: null,
    libAnnexe: null,
    zoneTexte: null,
    isFormalized: true,
    version: 1,
    validFrom: '2025-01-01T00:00:00.000Z',
    validTo: null,
    terms: termAxOrigines.map((ax, i) => makeTerm((i === 0 ? 1 : 2) as 1 | 2, i + 1, ax)),
  };
}

describe('phase-b — groupRulesByAnnexe()', () => {
  it('returns an empty map for an empty input', () => {
    const groups = groupRulesByAnnexe([]);
    expect(groups.size).toBe(0);
  });

  it('groups intra-annexe rules by axTerm', () => {
    const rules: RuleWithTerms[] = [
      makeRule('r1', '00', 1, ['00', '00']),
      makeRule('r2', '00', 2, ['00']),
      makeRule('r3', '130', 1, ['130', '130']),
    ];
    const groups = groupRulesByAnnexe(rules);
    expect(groups.size).toBe(2);
    expect(groups.get('00')!.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(groups.get('130')!.map((r) => r.id)).toEqual(['r3']);
  });

  it('places an inter-annexe rule in its bearer (axTerm) group only', () => {
    const rules: RuleWithTerms[] = [makeRule('r-inter', '130', 12, ['130', '00'])];
    const groups = groupRulesByAnnexe(rules);
    expect(groups.size).toBe(1);
    expect(groups.has('130')).toBe(true);
    expect(groups.has('00')).toBe(false);
    expect(groups.get('130')![0]!.typeCtrl).toBe('inter_ax');
  });

  it('preserves input order within each group', () => {
    const rules: RuleWithTerms[] = [
      makeRule('r-a-1', '00', 1, ['00']),
      makeRule('r-b-1', '130', 1, ['130']),
      makeRule('r-a-2', '00', 2, ['00']),
      makeRule('r-b-2', '130', 2, ['130']),
      makeRule('r-a-3', '00', 3, ['00']),
    ];
    const groups = groupRulesByAnnexe(rules);
    expect(groups.get('00')!.map((r) => r.id)).toEqual(['r-a-1', 'r-a-2', 'r-a-3']);
    expect(groups.get('130')!.map((r) => r.id)).toEqual(['r-b-1', 'r-b-2']);
  });

  it('N rules across M annexes yields M groups whose sizes sum to N', () => {
    const rules: RuleWithTerms[] = [
      makeRule('r1', '00', 1, ['00']),
      makeRule('r2', '00', 2, ['00']),
      makeRule('r3', '130', 1, ['130']),
      makeRule('r4', '47', 1, ['47']),
      makeRule('r5', '47', 2, ['00']), // inter-annexe; bearer = 47
      makeRule('r6', '781', 1, ['781']),
    ];
    const groups = groupRulesByAnnexe(rules);
    expect(groups.size).toBe(4);
    const total = Array.from(groups.values()).reduce((acc, b) => acc + b.length, 0);
    expect(total).toBe(rules.length);
    expect(groups.get('47')!.length).toBe(2);
    expect(groups.has('00')).toBe(true);
    expect(groups.has('130')).toBe(true);
    expect(groups.has('781')).toBe(true);
  });
});
