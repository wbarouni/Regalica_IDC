/**
 * Unit tests for `resolveTerms`. Pure in-memory CellMatrix; no DB, no
 * fixtures, no XML parsing.
 */

import Decimal from 'decimal.js';
import type { CellMatrix } from '@regflow/bct-xml-parser';

import { resolveTerms } from '../src/resolve-terms.js';
import type { RuleTerm } from '../src/types.js';

function buildCells(spec: Record<string, Record<string, Record<string, string>>>): CellMatrix {
  const out = new Map<string, Map<string, Map<string, Decimal>>>();
  for (const [annexe, rubriques] of Object.entries(spec)) {
    const annMap = new Map<string, Map<string, Decimal>>();
    for (const [rubrique, colonnes] of Object.entries(rubriques)) {
      const rubMap = new Map<string, Decimal>();
      for (const [colonne, raw] of Object.entries(colonnes)) {
        rubMap.set(colonne, new Decimal(raw));
      }
      annMap.set(rubrique, rubMap);
    }
    out.set(annexe, annMap);
  }
  return out;
}

function makeTerm(overrides: Partial<RuleTerm>): RuleTerm {
  return {
    id: overrides.id ?? 'term-x',
    rang: overrides.rang ?? 1,
    numSeq: overrides.numSeq ?? 1,
    termOp: overrides.termOp ?? '+',
    kind: overrides.kind ?? 'cell_ref',
    axOrigine: overrides.axOrigine ?? '00',
    rubriqueCode: overrides.rubriqueCode ?? 'R000',
    colonne: overrides.colonne ?? '1',
    literalValue: overrides.literalValue ?? null,
    literalText: overrides.literalText ?? null,
  };
}

describe('resolve-terms — resolveTerms()', () => {
  it('resolves a cell_ref term to the matrix value', () => {
    const cells = buildCells({ '00': { CP01: { '1': '123.45' } } });
    const term = makeTerm({ axOrigine: '00', rubriqueCode: 'CP01', colonne: '1' });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.skipReason).toBeNull();
    expect(resolved!.value).not.toBeNull();
    expect(resolved!.value!.equals(new Decimal('123.45'))).toBe(true);
  });

  it('skips with missing_annexe when the annexe is absent', () => {
    const cells = buildCells({ '00': { CP01: { '1': '1' } } });
    const term = makeTerm({ axOrigine: '999', rubriqueCode: 'CP01', colonne: '1' });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.skipReason).toBe('missing_annexe');
    expect(resolved!.value).toBeNull();
  });

  it('skips with missing_rubrique when the rubrique is absent', () => {
    const cells = buildCells({ '00': { CP01: { '1': '1' } } });
    const term = makeTerm({ axOrigine: '00', rubriqueCode: 'NOPE', colonne: '1' });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.skipReason).toBe('missing_rubrique');
  });

  it('skips with missing_colonne when the colonne is absent', () => {
    const cells = buildCells({ '00': { CP01: { '1': '1' } } });
    const term = makeTerm({ axOrigine: '00', rubriqueCode: 'CP01', colonne: '9' });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.skipReason).toBe('missing_colonne');
  });

  it('returns the literalValue as-is for kind=literal terms', () => {
    const cells = buildCells({});
    const lit = new Decimal('42.0');
    const term = makeTerm({
      kind: 'literal',
      literalValue: lit,
      axOrigine: null,
      rubriqueCode: null,
      colonne: null,
    });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.skipReason).toBeNull();
    expect(resolved!.value!.equals(lit)).toBe(true);
  });

  it('emits skipReason=literal for kind=literal_text terms', () => {
    const cells = buildCells({});
    const term = makeTerm({
      kind: 'literal_text',
      literalText: 'cf zone texte',
      axOrigine: null,
      rubriqueCode: null,
      colonne: null,
    });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.skipReason).toBe('literal');
    expect(resolved!.value).toBeNull();
  });

  it('treats sentinel D ax_origine as missing_annexe (conservative)', () => {
    const cells = buildCells({ '00': { CP01: { '1': '1' } } });
    const term = makeTerm({ axOrigine: 'D1', rubriqueCode: 'CP01', colonne: '1' });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.skipReason).toBe('missing_annexe');
  });

  it('treats sentinel C ax_origine as missing_annexe (conservative)', () => {
    const cells = buildCells({ '00': { CP01: { '1': '1' } } });
    const term = makeTerm({ axOrigine: 'C0', rubriqueCode: 'CP01', colonne: null });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.skipReason).toBe('missing_annexe');
  });

  it('preserves Decimal precision (38 digits) end-to-end', () => {
    const longValue = '1.2345678901234567890123456789012345678';
    const cells = buildCells({ '00': { CP01: { '1': longValue } } });
    const term = makeTerm({ axOrigine: '00', rubriqueCode: 'CP01', colonne: '1' });
    const [resolved] = resolveTerms([term], cells);
    expect(resolved!.value!.toFixed()).toBe(longValue);
    expect(Decimal.precision).toBe(38);
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_EVEN);
  });

  it('resolves an array of mixed terms in a single call', () => {
    const cells = buildCells({
      '00': { CP01: { '1': '10', '2': '20' } },
      '130': { R130: { '5': '500' } },
    });
    const terms = [
      makeTerm({
        id: 't1',
        rang: 1,
        numSeq: 1,
        axOrigine: '00',
        rubriqueCode: 'CP01',
        colonne: '1',
      }),
      makeTerm({
        id: 't2',
        rang: 2,
        numSeq: 1,
        axOrigine: '130',
        rubriqueCode: 'R130',
        colonne: '5',
      }),
      makeTerm({ id: 't3', rang: 2, numSeq: 2, axOrigine: '999', rubriqueCode: 'X', colonne: '1' }),
    ];
    const resolved = resolveTerms(terms, cells);
    expect(resolved).toHaveLength(3);
    expect(resolved[0]!.value!.toString()).toBe('10');
    expect(resolved[1]!.value!.toString()).toBe('500');
    expect(resolved[2]!.skipReason).toBe('missing_annexe');
  });
});
