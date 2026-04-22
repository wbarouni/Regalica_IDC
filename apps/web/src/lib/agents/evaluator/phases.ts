import Decimal from 'decimal.js';
import { parseBctXml, type CellMatrix } from '../bct-xml-parser';
import type { EvaluationVerdict, RuleTerm, RuleWithTerms, VerdictStatus } from './types';

Decimal.set({ precision: 38, rounding: Decimal.ROUND_HALF_EVEN });

export type ParsedXmlMap = CellMatrix;

export function phaseA(xmlFiles: Map<string, string>): ParsedXmlMap {
  const result: ParsedXmlMap = new Map();
  for (const [, content] of xmlFiles) {
    const parsed = parseBctXml(content);
    for (const [axCode, rubMap] of parsed.cells) {
      result.set(axCode, rubMap);
    }
  }
  return result;
}

export type RuleGroup = Map<string, RuleWithTerms[]>;

export function phaseB(rules: RuleWithTerms[]): RuleGroup {
  const groups: RuleGroup = new Map();
  for (const rule of rules) {
    const key = `${rule.annexe_code}::${rule.num_regle}`;
    const existing = groups.get(key) ?? [];
    existing.push(rule);
    groups.set(key, existing);
  }
  return groups;
}

export type SkipStatus = Extract<VerdictStatus,
  | 'SKIPPED_MISSING_ANNEXE'
  | 'SKIPPED_MISSING_RUBRIQUE'
  | 'SKIPPED_MISSING_COLONNE'
  | 'SKIPPED_LITERAL_TEXT'>;

export type ResolvedTerm = { value: Decimal; term: RuleTerm } | { skip: SkipStatus };

function normalizeAx(raw: string): string { return raw.replace(/^0+/, '') || '0'; }
function normalizeCol(raw: string): string { return raw.replace(/^0+/, '') || '0'; }

export function resolveTerms(terms: RuleTerm[], cells: ParsedXmlMap): ResolvedTerm[] {
  return terms.map((t): ResolvedTerm => {
    if (t.kind === 'literal_text') return { skip: 'SKIPPED_LITERAL_TEXT' };
    if (t.kind === 'literal') return { value: new Decimal(String(t.literal_value ?? '0')), term: t };
    const axNorm = normalizeAx(t.ax_origine ?? '');
    const rubMap = cells.get(axNorm);
    if (!rubMap) return { skip: 'SKIPPED_MISSING_ANNEXE' };
    const colMap = rubMap.get(t.rubrique_code ?? '');
    if (!colMap) return { skip: 'SKIPPED_MISSING_RUBRIQUE' };
    const val = colMap.get(normalizeCol(t.colonne ?? ''));
    if (val === undefined) return { skip: 'SKIPPED_MISSING_COLONNE' };
    return { value: val, term: t };
  });
}

function foldTerms(terms: Array<{ value: Decimal; term: RuleTerm }>): Decimal | null {
  if (terms.length === 0) return null;
  let acc = new Decimal(0);
  for (const { value: v, term: t } of terms) {
    switch (t.term_op) {
      case '+': acc = acc.plus(v); break;
      case '-': acc = acc.minus(v); break;
      case '*': acc = acc.times(v); break;
      case '/':
        if (v.isZero()) return null;
        acc = acc.dividedBy(v);
        break;
    }
  }
  return acc;
}

export function phaseD(resolved: ResolvedTerm[]): { lhs: Decimal; rhs: Decimal } | { skip: VerdictStatus } {
  for (const r of resolved) {
    if ('skip' in r) return { skip: r.skip };
  }
  const valid = resolved as Array<{ value: Decimal; term: RuleTerm }>;
  const rang1 = valid.filter(t => t.term.rang === 1);
  const rang2 = valid.filter(t => t.term.rang === 2);
  const lhsResult = rang1.length === 0 ? new Decimal(0) : foldTerms(rang1);
  const rhsResult = foldTerms(rang2);
  if (lhsResult === null || rhsResult === null) return { skip: 'SKIPPED_MISSING_COLONNE' };
  return { lhs: lhsResult, rhs: rhsResult ?? new Decimal(0) };
}

const UNSUPPORTED_OPS = new Set(['MAX', 'MIN', 'VA']);

export function phaseE(rule: RuleWithTerms, aggResult: { lhs: Decimal; rhs: Decimal } | { skip: VerdictStatus }): EvaluationVerdict {
  const base = { ruleId: rule.id, annexeCode: rule.annexe_code, numRegle: rule.num_regle, operRegle: rule.oper_regle };
  if (rule.zone_texte !== null && rule.zone_texte !== undefined)
    return { ...base, status: 'SKIPPED_CONDITIONAL', lhs: null, rhs: null, gap: null, skipReason: rule.zone_texte };
  if (UNSUPPORTED_OPS.has(rule.oper_regle))
    return { ...base, status: 'SKIPPED_UNSUPPORTED_OP', lhs: null, rhs: null, gap: null, skipReason: rule.oper_regle };
  if ('skip' in aggResult)
    return { ...base, status: aggResult.skip, lhs: null, rhs: null, gap: null, skipReason: String(aggResult.skip) };
  const { lhs, rhs } = aggResult;
  let pass: boolean;
  switch (rule.oper_regle) {
    case '=': case 'SUM': pass = lhs.equals(rhs); break;
    case '>=': pass = lhs.gte(rhs); break;
    case '<=': pass = lhs.lte(rhs); break;
    case '>':  pass = lhs.gt(rhs);  break;
    case '<':  pass = lhs.lt(rhs);  break;
    default:
      return { ...base, status: 'SKIPPED_UNSUPPORTED_OP', lhs: lhs.toFixed(), rhs: rhs.toFixed(), gap: null, skipReason: rule.oper_regle };
  }
  if (pass) return { ...base, status: 'PASS', lhs: lhs.toFixed(), rhs: rhs.toFixed(), gap: null, skipReason: null };
  return { ...base, status: 'FAIL', lhs: lhs.toFixed(), rhs: rhs.toFixed(), gap: lhs.minus(rhs).toFixed(), skipReason: null };
}
