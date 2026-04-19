/**
 * Standalone script — runs the evaluator on the 5 golden XML fixtures
 * and prints pass/fail/skip counts. Used to calibrate golden.test.ts.
 * NOT a test file — run with: node_modules/.bin/tsx src/tests/run-golden.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import { runEvaluation } from '../agents/evaluator/index.js';

Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');

function toS(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function kindFn(col: unknown, rub: unknown): 'cell_ref' | 'literal' | 'literal_text' {
  if (toS(col) !== null) return 'cell_ref';
  const r = toS(rub);
  return r !== null && !isNaN(Number(r)) ? 'literal' : 'literal_text';
}

const wb = XLSX.readFile(path.join(PROJECT_ROOT, 'tests/fixtures/rdg.xlsx'), {
  cellDates: false, raw: true,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rows = XLSX.utils.sheet_to_json<any>(wb.Sheets['RDG']!, { defval: undefined });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ruleMap = new Map<string, { firstRow: any; termRows: any[] }>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
for (const row of rows as any[]) {
  const ax = toS(row.AX_TERM), nr = row.NUM_REGLE;
  if (!ax || nr == null) continue;
  const key = `${ax}::${nr}`;
  if (!ruleMap.has(key)) ruleMap.set(key, { firstRow: row, termRows: [] });
  ruleMap.get(key)!.termRows.push(row);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rules: any[] = [];
for (const [, { firstRow, termRows }] of ruleMap) {
  const ruleId = crypto.randomUUID();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terms = termRows.map((row: any, idx: number) => {
    const k = kindFn(row.COLONNE, row.RUBRIQUE);
    const colStr = toS(row.COLONNE), rubStr = toS(row.RUBRIQUE);
    return {
      id: crypto.randomUUID(), rule_id: ruleId,
      rang: row.RANG_TERM ?? 1, num_seq: row.NUM_SEQ ?? idx + 1,
      term_op: toS(row.OPER_TERM_REGLE) ?? '+', kind: k,
      ax_origine: toS(row.AX_ORIGINE),
      rubrique_code: k === 'cell_ref' ? rubStr : null,
      colonne: k === 'cell_ref' ? colStr : null,
      literal_value: k === 'literal' ? new Decimal(rubStr!).toFixed(8) : null,
      literal_text: k === 'literal_text' ? rubStr : null,
    };
  });
  rules.push({
    id: ruleId, tenant_id: '00000000-0000-0000-0000-000000000001',
    annexe_code: toS(firstRow.AX_TERM), num_regle: firstRow.NUM_REGLE,
    oper_regle: toS(firstRow.OPER_REGLE), type_ctrl: toS(firstRow.TYPE_CTRL),
    zone_texte: toS(firstRow.ZONE_TEXTE), is_active: true, terms,
  });
}

const xmlDir = path.join(PROJECT_ROOT, 'tests/fixtures/golden/bank-23/2024-03-31');
const xmlFiles = new Map<string, string>();
for (const f of fs.readdirSync(xmlDir)) {
  if (f.endsWith('.XML')) xmlFiles.set(f, fs.readFileSync(path.join(xmlDir, f), 'utf-8'));
}

async function main() {
  console.log(`Loaded ${rules.length} rules, ${xmlFiles.size} XML files`);
  const result = await runEvaluation(xmlFiles, rules as never, '00000000-0000-0000-0000-000000000001');
  console.log('PASS:', result.pass);
  console.log('FAIL:', result.fail);
  console.log('SKIP:', result.skip);
  console.log('TOTAL:', result.pass + result.fail + result.skip);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result.verdicts.filter((v: any) => v.status === 'FAIL').forEach((v: any) => {
    console.log(`  FAIL annexe=${v.annexeCode} rule=${v.numRegle} gap=${v.gap}`);
  });
}
main().catch(console.error);
