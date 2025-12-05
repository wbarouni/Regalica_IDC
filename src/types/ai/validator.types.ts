/**
 * REGALICA AI - VALIDATOR TYPES
 * Types pour le Validator AI basés sur la spécification JSON Output v1.0
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type ValidationStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type RuleStatus = 'OK' | 'ERROR' | 'SKIPPED'
export type Severity = 'SEVERE' | 'ROUNDING'
export type TermSource = 'XML' | 'CONSTANTE' | 'MISSING' | 'CALCULATED'

export const ERROR_CODES = {
  XML_PARSE_ERROR: 'Erreur de parsing XML',
  XML_INVALID_STRUCTURE: 'Structure XML invalide',
  XML_MISSING_HEADER: 'Entête XML manquant',
  XML_MISSING_CODE_ANNEXE: 'CodeAnnexe non trouvé',
  XML_MISSING_CODE_BANQUE: 'CodeBanque non trouvé',
  XML_MISSING_DATE_ANNEXE: 'DateAnnexe non trouvé',
  RULES_NOT_FOUND: 'Aucune règle trouvée pour cette annexe',
  RULES_FILTER_ERROR: 'Erreur lors du filtrage des règles',
  CALCULATION_ERROR: 'Erreur de calcul',
  DECIMAL_OVERFLOW: 'Dépassement de capacité numérique',
  DIVISION_BY_ZERO: 'Division par zéro détectée',
  DATABASE_ERROR: 'Erreur base de données',
  TIMEOUT: 'Délai de traitement dépassé',
} as const

export type ErrorCode = keyof typeof ERROR_CODES

// ============================================================================
// FILE & METADATA
// ============================================================================

export interface FileInfo {
  name: string
  size: number
  url: string
  uploadedAt: string
}

export interface ValidationMetadata {
  codeBanque: string
  dateAnnexe: string
  codeAnnexe: string
  annexeName: string
}

// ============================================================================
// STATISTICS
// ============================================================================

export interface ValidationStatistics {
  totalRules: number
  okCount: number
  errorCount: number
  skippedCount: number
  conformityRate: number
  severityBreakdown: {
    SEVERE: number
    ROUNDING: number
  }
}

// ============================================================================
// RULE TERMS
// ============================================================================

export interface RuleTerm {
  rangTerm: number
  numSeq: number
  rubrique: string
  colonne: string | null
  operTermRegle: string
  axOrigine: string
  valeur: string | null
  source: TermSource
}

export interface RuleTerms {
  calculee: RuleTerm[]
  attendue: RuleTerm[]
}

// ============================================================================
// CALCULATION
// ============================================================================

export interface RuleCalculation {
  calculee: string | null
  attendue: string | null
  ecart: string | null
  ecartAbsolu: string | null
  ecartRelatif: string | null
}

// ============================================================================
// RULE RESULT
// ============================================================================

export interface RuleResult {
  numRegle: number
  ruleId: string
  domaine: string
  annexe: string
  zoneTexte: string
  operator: string
  calculation: RuleCalculation
  status: RuleStatus
  severity: Severity | null
  skipReason?: string
  terms: RuleTerms
}

// ============================================================================
// SUMMARY
// ============================================================================

export interface DomainSummary {
  domaine: string
  total: number
  ok: number
  error: number
  skipped: number
  conformityRate: number
}

export interface SeveritySummary {
  severity: Severity
  count: number
  rules: number[]
}

export interface TopError {
  numRegle: number
  ecartAbsolu: string
  domaine: string
}

export interface ValidationSummary {
  byDomain: DomainSummary[]
  bySeverity: SeveritySummary[]
  topErrors: TopError[]
}

// ============================================================================
// VALIDATION OBJECT
// ============================================================================

export interface Validation {
  id: string
  tenantId: string
  userId: string
  file: FileInfo
  metadata: ValidationMetadata
  statistics: ValidationStatistics
  status: ValidationStatus
  completedAt?: string
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ValidatorSuccessResponse {
  success: true
  timestamp: string
  processingTime: number
  validation: Validation
  results: RuleResult[]
  summary: ValidationSummary
}

export interface ValidationErrorDetails {
  line?: number
  column?: number
  reason?: string
  [key: string]: unknown
}

export interface ValidatorErrorResponse {
  success: false
  timestamp: string
  processingTime: number
  validation: {
    id: string
    status: 'failed'
  }
  error: {
    code: ErrorCode
    message: string
    details?: ValidationErrorDetails
  }
}

export type ValidatorResponse = ValidatorSuccessResponse | ValidatorErrorResponse

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface ValidateRequest {
  tenantId: string
  userId: string
  fileUrl: string
  fileName: string
  fileSize: number
  options?: {
    toleranceOverride?: number
    skipRoundingErrors?: boolean
    maxRules?: number
  }
}

export interface ValidationStatusRequest {
  validationId: string
}

export interface ValidationResultsFilter {
  status?: RuleStatus
  severity?: Severity
  domaine?: string
  page?: number
  pageSize?: number
}
