/**
 * Integration test for the engine orchestrator.
 *
 * Builds a minimal EvaluationInput in memory (no DB, no XML, no
 * golden fixture) with two rules — one that must PASS and one that
 * must FAIL — and asserts the orchestrator wires the five phases
 * correctly.
 */

import Decimal from 'decimal.js';
import type { CellMatrix, ParsedXml } from '@regflow/bct-xml-parser';

import { runEvaluation } from '../src/engine.js';
import type { EvaluationInput, RuleTerm, RuleWithTerms } from '../src/types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeTerm(
  rang: 1 | 2 | 3,
  numSeq: number,
  rubrique: string,
  colonne: string,
  termOp: RuleTerm['termOp'] = '+',
): RuleTerm {
  return {
    id: `t-r${rang}-s${numSeq}`,
    rang,
    numSeq,
    termOp,
    kind: 'cell_ref',
    axOrigine: '00',
    rubriqueCode: rubrique,
    colonne,
    literalValue: null,
    literalText: null,
  };
}

function makeRule(
  id: string,
  numRegle: number,
  rhsRubrique: string,
  rhsColonne: string,
  lhsRubrique: string,
  lhsColonne: string,
): RuleWithTerms {
  return {
    id,
    tenantId: 'tenant-engine-test',
    axTerm: '00',
    numRegle,
    operRegle: '=',
    typeCtrl: 'intra_ax',
    domaine: null,
    libAnnexe: null,
    zoneTexte: null,
    isFormalized: true,
    version: 1,
    validFrom: '2025-01-01T00:00:00.000Z',
    validTo: null,
    terms: [makeTerm(1, 1, rhsRubrique, rhsColonne), makeTerm(2, 1, lhsRubrique, lhsColonne)],
  };
}

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

describe('engine — runEvaluation()', () => {
  it('runs the full pipeline and produces deterministic verdicts', async () => {
    const cells = buildCells({
      '00': {
        R1: { '1': '100', '2': '200' },
        R2: { '1': '100', '2': '100' },
      },
    });

    const passingRule = makeRule('rule-pass', 1, 'R1', '1', 'R2', '1');
    const failingRule = makeRule('rule-fail', 2, 'R1', '2', 'R2', '2');

    const input: EvaluationInput = {
      tenantId: 'tenant-engine-test',
      arreteDate: '2025-06-01',
      parsedXmls: new Map<string, ParsedXml>(),
      mergedCells: cells,
      rules: [passingRule, failingRule],
    };

    const result = await runEvaluation(input);

    expect(result.verdicts).toHaveLength(2);

    const passVerdict = result.verdicts.find((v) => v.ruleId === 'rule-pass')!;
    const failVerdict = result.verdicts.find((v) => v.ruleId === 'rule-fail')!;

    expect(passVerdict.status).toBe('PASS');
    expect(failVerdict.status).toBe('FAIL');

    expect(result.totals.pass).toBe(1);
    expect(result.totals.failSevere + result.totals.failRounding).toBe(1);
    expect(result.totals.rulesApplicableTotal).toBe(2);

    expect(UUID_REGEX.test(result.runId)).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    expect(result.tenantId).toBe('tenant-engine-test');
    expect(result.arreteDate).toBe('2025-06-01');
  });

  it('sorts verdicts deterministically by (annexeCode, numRegle)', async () => {
    const cells = buildCells({ '00': { R: { '1': '0' } }, '47': { R: { '1': '0' } } });
    const rA = {
      ...makeRule('a', 5, 'R', '1', 'R', '1'),
      axTerm: '47',
    };
    const rB = makeRule('b', 1, 'R', '1', 'R', '1');
    const rC = {
      ...makeRule('c', 1, 'R', '1', 'R', '1'),
      axTerm: '47',
    };

    const input: EvaluationInput = {
      tenantId: 't',
      arreteDate: '2025-06-01',
      parsedXmls: new Map(),
      mergedCells: cells,
      // Intentionally out-of-order to exercise the sort.
      rules: [rA, rB, rC],
    };

    const result = await runEvaluation(input);
    expect(result.verdicts.map((v) => `${v.annexeCode}/${v.numRegle}`)).toEqual([
      '00/1',
      '47/1',
      '47/5',
    ]);
  });

  it('reports an engineVersion sourced from the package.json', async () => {
    const input: EvaluationInput = {
      tenantId: 't',
      arreteDate: '2025-06-01',
      parsedXmls: new Map(),
      mergedCells: new Map(),
      rules: [],
    };
    const result = await runEvaluation(input);
    expect(result.enginVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('honours optional snapshot identifiers', async () => {
    const input: EvaluationInput = {
      tenantId: 't',
      arreteDate: '2025-06-01',
      parsedXmls: new Map(),
      mergedCells: new Map(),
      rules: [],
    };
    const result = await runEvaluation(input, {
      rulesVersionSnapshot: 'rules@abcd1234',
      referentialsVersionSnapshot: 'refs@efgh5678',
    });
    expect(result.rulesVersionSnapshot).toBe('rules@abcd1234');
    expect(result.referentialsVersionSnapshot).toBe('refs@efgh5678');
  });
});
