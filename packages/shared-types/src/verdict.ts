/**
 * Verdict taxonomy per master document §9.5.
 * A full reporting run produces one Verdict per applicable rule × per rubrique scope.
 */
export type VerdictStatus = 'PASS' | 'FAIL' | 'SKIPPED' | 'ERROR';

export interface Verdict {
  ruleId: string;
  ruleCategory: string;
  status: VerdictStatus;
  severity: 'SEVERE' | 'WARN' | 'INFO';
  expected?: string;
  actual?: string;
  delta?: string;
  message?: string;
  citations?: string[];
  evaluatedAt: string;
}

export interface ValidationRunSummary {
  runId: string;
  tenantId: string;
  uploadVersionId: string;
  periodEnd: string;
  totalRules: number;
  applicableRules: number;
  pass: number;
  fail: number;
  skipped: number;
  complianceRate: number;
  startedAt: string;
  completedAt?: string;
}
