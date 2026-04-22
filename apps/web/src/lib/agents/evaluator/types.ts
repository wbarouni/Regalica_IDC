export interface RuleTerm {
  id: string;
  rule_id: string;
  rang: number;
  num_seq: number;
  term_op: string | null;
  kind: 'cell_ref' | 'literal' | 'literal_text';
  ax_origine: string;
  rubrique_code: string | null;
  colonne: string | null;
  literal_value: string | null;
  literal_text: string | null;
}

export type VerdictStatus =
  | 'PASS'
  | 'FAIL'
  | 'SKIPPED_MISSING_ANNEXE'
  | 'SKIPPED_MISSING_RUBRIQUE'
  | 'SKIPPED_MISSING_COLONNE'
  | 'SKIPPED_CONDITIONAL'
  | 'SKIPPED_UNSUPPORTED_OP'
  | 'SKIPPED_LITERAL_TEXT';

export interface EvaluationVerdict {
  ruleId: string;
  annexeCode: string;
  numRegle: number;
  operRegle: string;
  status: VerdictStatus;
  lhs: string | null;
  rhs: string | null;
  gap: string | null;
  skipReason: string | null;
}

export interface EvaluationResult {
  runId: string;
  pass: number;
  fail: number;
  skip: number;
  verdicts: EvaluationVerdict[];
  durationMs: number;
}

export interface RuleWithTerms {
  id: string;
  tenant_id: string;
  annexe_code: string;
  num_regle: number;
  oper_regle: string;
  type_ctrl: string;
  zone_texte: string | null;
  is_active: boolean;
  terms: RuleTerm[];
}
