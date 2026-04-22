import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import { runEvaluation } from '@/lib/agents/evaluator/index';
import { parseBctXml } from '@/lib/agents/bct-xml-parser';
import type { RuleWithTerms } from '@/lib/agents/evaluator/types';

Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

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

function normalizeAx(raw: string): string { return raw.replace(/^0+/, '') || '0'; }

let cachedRules: RuleWithTerms[] | null = null;

function loadRules(): RuleWithTerms[] {
  if (cachedRules) return cachedRules;

  const rdgPath = path.join(process.cwd(), '..', '..', 'tests', 'fixtures', 'rdg.xlsx');
  const buf = fs.readFileSync(rdgPath);
  const wb = XLSX.read(buf, { cellDates: false, raw: true });
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

  const rules: RuleWithTerms[] = [];
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
        ax_origine: toS(row.AX_ORIGINE) ?? '',
        rubrique_code: k === 'cell_ref' ? rubStr : null,
        colonne: k === 'cell_ref' ? colStr : null,
        literal_value: k === 'literal' ? new Decimal(rubStr!).toFixed(8) : null,
        literal_text: k === 'literal_text' ? rubStr : null,
      };
    });
    rules.push({
      id: ruleId, tenant_id: '00000000-0000-0000-0000-000000000001',
      annexe_code: toS(firstRow.AX_TERM) ?? '',
      num_regle: firstRow.NUM_REGLE as number,
      oper_regle: toS(firstRow.OPER_REGLE) ?? '=',
      type_ctrl: toS(firstRow.TYPE_CTRL) ?? '',
      zone_texte: toS(firstRow.ZONE_TEXTE),
      is_active: true, terms,
    });
  }

  cachedRules = rules;
  return rules;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const xmlFiles = new Map<string, string>();

  const entries = formData.getAll('file').concat(formData.getAll('files'));
  for (const entry of entries) {
    if (entry instanceof Blob) {
      const name = entry instanceof File ? entry.name : `rapport_${xmlFiles.size}.xml`;
      xmlFiles.set(name, await entry.text());
    }
  }

  if (xmlFiles.size === 0) {
    return NextResponse.json({ error: 'Au moins un fichier XML est requis' }, { status: 400 });
  }

  // Detect which annexes are in the uploaded files (from <CodeAnnexe> header)
  const uploadedAnnexeCodes = new Set<string>();
  for (const content of xmlFiles.values()) {
    try {
      const parsed = parseBctXml(content);
      uploadedAnnexeCodes.add(parsed.annexeCode); // already normalized (leading zeros stripped)
    } catch { /* structural errors handled by /api/validate */ }
  }

  let allRules: RuleWithTerms[];
  try {
    allRules = loadRules();
  } catch (e) {
    return NextResponse.json({ error: `Impossible de charger rdg.xlsx: ${String(e)}` }, { status: 500 });
  }

  // Only evaluate rules that BELONG to the uploaded annexes (AX_TERM matches)
  // Cross-annexe data (AX_ORIGINE) may still reference other annexes — those get
  // SKIPPED_MISSING_ANNEXE if the source file was not uploaded, and Regalica asks for them.
  const relevantRules = uploadedAnnexeCodes.size > 0
    ? allRules.filter(r => uploadedAnnexeCodes.has(normalizeAx(r.annexe_code)))
    : allRules;

  // Compute which additional annexes are referenced in inter-annexe terms but not uploaded
  const requiredAnnexes = new Set<string>();
  for (const rule of relevantRules) {
    for (const term of rule.terms) {
      if (term.kind === 'cell_ref') {
        const axNorm = normalizeAx(term.ax_origine ?? '');
        if (axNorm && !uploadedAnnexeCodes.has(axNorm)) {
          requiredAnnexes.add(axNorm);
        }
      }
    }
  }

  const result = await runEvaluation(xmlFiles, relevantRules, '00000000-0000-0000-0000-000000000001');

  return NextResponse.json({
    ...result,
    uploadedAnnexes: [...uploadedAnnexeCodes].sort(),
    requiredAnnexes: [...requiredAnnexes].sort(),
    totalRulesForAnnexe: relevantRules.length,
  });
}
