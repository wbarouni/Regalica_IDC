/**
 * Golden test — BCT 2024-03-31 evaluation engine (fixture set: 00, 01, 02, 51, 640)
 *
 * Baseline measured empirically on our 5-file fixture set (run-golden.ts):
 *   PASS: 937 · FAIL: 2 · SKIP: 3672 · TOTAL: 4611
 *
 * NOTE: The master doc §9.6 quotes 1,014 PASS / 3 FAIL on 4 XMLs (00, 51, 630, 640).
 * Our fixture set does NOT include 630.XML — the 3rd FAIL (intra-630 rule 265) is
 * therefore SKIPPED_MISSING_ANNEXE in this suite. The 2 FAILs that DO appear reference
 * Bilan (annexe 00) data from within 630-stamped rules — those CAN be evaluated.
 * Once the 630 XML fixture is added, update all numbers to match §9.6 exactly.
 *
 * Per CLAUDE.md Pilier 6: this baseline must never regress. Any commit that changes
 * these numbers must include an explanation + updated baseline.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';

import { runEvaluation } from '../src/agents/evaluator';
import type { EvaluationVerdict, RuleWithTerms } from '../src/agents/evaluator/types';
import type { RuleTerm } from '../src/db/models/rule-term';

Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const XLSX_PATH = path.join(PROJECT_ROOT, 'tests/fixtures/rdg.xlsx');
const XML_DIR = path.join(
  PROJECT_ROOT,
  'tests/fixtures/golden/bank-23/2024-03-31',
);

const XML_FILES = [
  '00-2024-03-31.XML',
  '01-2024-03-31.XML',
  '02-2024-03-31.XML',
  '51-2024-03-31.XML',
  '640-2024-03-31.XML',
];

const SHEET_NAME = 'RDG';
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

// ─── XLSX row type (mirrors rdg-seeder.ts) ────────────────────────────────────

interface RdgRow {
  LIB_DOMAINE: string | undefined;
  LIB_ANNEXE: string | undefined;
  NUM_REGLE: number | undefined;
  OPER_REGLE: string | undefined;
  RANG_TERM: number | undefined;
  AX_TERM: string | undefined;
  RUBRIQUE: string | undefined;
  COLONNE: string | number | undefined;
  OPER_TERM_REGLE: string | undefined;
  NUM_SEQ: number | undefined;
  AX_ORIGINE: string | undefined;
  TYPE_CTRL: string | undefined;
  ZONE_TEXTE: string | undefined;
}

// ─── Helpers (identical to rdg-seeder.ts logic) ───────────────────────────────

function toNullableString(value: string | number | undefined): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function determineKind(
  colonne: string | number | undefined,
  rubrique: string | undefined,
): 'cell_ref' | 'literal' | 'literal_text' {
  const colonneStr = toNullableString(colonne);
  if (colonneStr !== null) return 'cell_ref';
  const rubrStr = toNullableString(rubrique);
  if (rubrStr !== null && !isNaN(Number(rubrStr))) return 'literal';
  return 'literal_text';
}

// ─── Build RuleWithTerms[] from XLSX (no DB) ──────────────────────────────────

function loadRulesFromXlsx(): RuleWithTerms[] {
  const workbook = XLSX.readFile(XLSX_PATH, { cellDates: false, raw: true });
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in ${XLSX_PATH}`);
  }
  const rows = XLSX.utils.sheet_to_json<RdgRow>(sheet, { defval: undefined });

  // Group rows by (AX_TERM, NUM_REGLE) — same key as seeder
  const ruleMap = new Map<
    string,
    { firstRow: RdgRow; termRows: RdgRow[] }
  >();

  for (const row of rows) {
    const axTerm = toNullableString(row.AX_TERM);
    const numRegle = row.NUM_REGLE;
    if (axTerm === null || numRegle === undefined || numRegle === null) continue;

    const operRegle = toNullableString(row.OPER_REGLE);
    const typeCtrl = toNullableString(row.TYPE_CTRL);
    if (operRegle === null || typeCtrl === null) continue;

    const key = `${axTerm}::${numRegle}`;
    if (!ruleMap.has(key)) {
      ruleMap.set(key, { firstRow: row, termRows: [] });
    }
    ruleMap.get(key)!.termRows.push(row);
  }

  // Convert groups to RuleWithTerms objects
  const rules: RuleWithTerms[] = [];

  for (const [, { firstRow, termRows }] of ruleMap) {
    const ruleId = randomUUID();
    const axTerm = toNullableString(firstRow.AX_TERM)!;
    const numRegle = firstRow.NUM_REGLE!;
    const operRegle = toNullableString(firstRow.OPER_REGLE)!;
    const typeCtrl = toNullableString(firstRow.TYPE_CTRL)!;
    // zone_texte is taken from the first row of the group (§9.4, same as seeder)
    const zoneTexte = toNullableString(firstRow.ZONE_TEXTE);

    const terms: RuleTerm[] = termRows.map((row, idx) => {
      const kind = determineKind(row.COLONNE, row.RUBRIQUE);
      const colonneStr = toNullableString(row.COLONNE);
      const rubrStr = toNullableString(row.RUBRIQUE);

      let rubrique_code: string | null = null;
      let colonne: string | null = null;
      let literal_value: string | null = null;
      let literal_text: string | null = null;

      if (kind === 'cell_ref') {
        rubrique_code = rubrStr;
        colonne = colonneStr;
      } else if (kind === 'literal') {
        literal_value = new Decimal(rubrStr!).toFixed(8);
      } else {
        literal_text = rubrStr;
      }

      const rang = (row.RANG_TERM ?? 1) as 1 | 2 | 3;
      const term_op = (toNullableString(row.OPER_TERM_REGLE) ?? '+') as
        | '+'
        | '-'
        | '*'
        | '/';
      const num_seq = row.NUM_SEQ ?? idx + 1;
      const ax_origine = toNullableString(row.AX_ORIGINE);

      // Build a plain object that satisfies the RuleTerm interface used by
      // phases.ts.  We do not instantiate the Sequelize Model class to avoid
      // needing a DB connection; phases.ts only accesses the declared fields.
      return {
        id: randomUUID(),
        rule_id: ruleId,
        rang,
        num_seq,
        term_op,
        kind,
        ax_origine,
        rubrique_code,
        colonne,
        literal_value,
        literal_text,
      } as unknown as RuleTerm;
    });

    rules.push({
      id: ruleId,
      tenant_id: DEFAULT_TENANT_ID,
      annexe_code: axTerm,
      num_regle: numRegle,
      oper_regle: operRegle,
      type_ctrl: typeCtrl,
      zone_texte: zoneTexte,
      is_active: true,
      terms,
    });
  }

  return rules;
}

// ─── Load XML files into the map expected by runEvaluation ───────────────────

function loadXmlFiles(): Map<string, string> {
  const xmlMap = new Map<string, string>();
  for (const filename of XML_FILES) {
    const filePath = path.join(XML_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    xmlMap.set(filename, content);
  }
  return xmlMap;
}

// ─── Golden test ──────────────────────────────────────────────────────────────

describe('Golden — BCT 2024-03-31 evaluation', () => {
  jest.setTimeout(60_000);

  let passCount: number;
  let failCount: number;
  let skipCount: number;
  let failVerdicts: EvaluationVerdict[];

  beforeAll(async () => {
    const rules = loadRulesFromXlsx();
    const xmlFiles = loadXmlFiles();

    const result = await runEvaluation(xmlFiles, rules, DEFAULT_TENANT_ID);

    passCount = result.pass;
    failCount = result.fail;
    skipCount = result.skip;
    failVerdicts = result.verdicts.filter((v) => v.status === 'FAIL');
  });

  it('produces exactly 937 PASS (baseline: 5 fixtures, no 630.XML)', () => {
    expect(passCount).toBe(937);
  });

  it('produces exactly 2 FAIL (rules 630/266 and 630/267 cross-bilan)', () => {
    expect(failCount).toBe(2);
  });

  it('accounts for all 4611 rules (PASS + FAIL + SKIP = 4611)', () => {
    expect(passCount + failCount + skipCount).toBe(4611);
  });

  it('both FAILs are on annexe 630 (cross-bilan PA030202000000)', () => {
    expect(failVerdicts).toHaveLength(2);
    expect(failVerdicts.every((v) => v.annexeCode === '630')).toBe(true);
    // Rule numbers 266 and 267 per master doc §9.6
    const failNums = failVerdicts.map((v) => v.numRegle).sort();
    expect(failNums).toEqual([266, 267]);
  });
});
