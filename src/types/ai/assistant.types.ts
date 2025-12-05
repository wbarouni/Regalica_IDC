/**
 * REGALICA AI - ASSISTANT TYPES
 * Types pour l'Assistant AI basés sur la spécification JSON Output v1.0
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type IntentType =
  | 'ERROR_ANALYSIS'
  | 'RULE_EXPLANATION'
  | 'CORRECTION_ADVISOR'
  | 'ANOMALY_DETECTOR'
  | 'TRANSLATOR'
  | 'SYSTEM_BASE'
  | 'GREETING'
  | 'UNKNOWN'

export type ConfidenceLevel = 'CERTAIN' | 'PROBABLE' | 'INCERTAIN'

export type AnomalyType =
  | 'INVERSION_CHIFFRES'
  | 'CHIFFRES_RONDS_SUSPECTS'
  | 'VALEUR_NEGATIVE_ANORMALE'
  | 'DOUBLON_POTENTIEL'
  | 'PATTERN_SUSPECT'
  | 'VARIATION_EXTREME'

export type AlertLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type CorrectionPriority = 'HIGH' | 'MEDIUM' | 'LOW'
export type CorrectionEffort = 'EASY' | 'MEDIUM' | 'HARD'
export type CorrectionAction = 'MODIFY' | 'ADD' | 'DELETE' | 'VERIFY'

export type SupportedLanguage = 'fr' | 'ar' | 'en'

export type SourceType =
  | 'validation_result'
  | 'rule_definition'
  | 'rag_rule'
  | 'rag_circulaire'
  | 'user_context'

// ============================================================================
// INTENT
// ============================================================================

export interface DetectedIntent {
  detected: IntentType
  confidence: number
  keywords: string[]
}

// ============================================================================
// SOURCES
// ============================================================================

export interface Source {
  type: SourceType
  numRegle?: number
  similarity?: number
  reference: string
}

// ============================================================================
// SUGGESTIONS
// ============================================================================

export interface Suggestion {
  text: string
  intent: IntentType
}

// ============================================================================
// METADATA
// ============================================================================

export interface AssistantMetadata {
  model: string
  fallback: boolean
  fallbackReason?: string
  originalModel?: string
  tokensUsed: number
  promptType: IntentType
  temperature: number
  cached: boolean
  grounded?: boolean
  groundingApplied?: string
}

// ============================================================================
// RULE DETAIL (for explanations)
// ============================================================================

export interface RuleDetail {
  numRegle: number
  domaine: string
  annexe: string
  operator: string
  zoneTexte: string
  calculee: string
  attendue: string
  ecart: string
  status: string
  severity: string | null
  termsCount: number
}

// ============================================================================
// CORRECTION
// ============================================================================

export interface Correction {
  numRegle: number
  priority: CorrectionPriority
  effort: CorrectionEffort
  rubrique: string
  colonne: string
  valeurActuelle: string
  valeurCorrigee: string
  ecart: string
  action: CorrectionAction
  warning: string | null
}

export interface ImpactEstimate {
  currentConformity: number
  projectedConformity: number
  errorsRemaining: number
}

// ============================================================================
// ANOMALY
// ============================================================================

export interface Anomaly {
  id: number
  type: AnomalyType
  numRegle: number | null
  rubrique: string | null
  probability: number
  impact: 'HIGH' | 'MEDIUM' | 'LOW'
  hypothesis: string
}

// ============================================================================
// TRANSLATION
// ============================================================================

export interface Translation {
  sourceLanguage: SupportedLanguage
  targetLanguage: SupportedLanguage
  sourceText: string
  translatedText: string
  rtl: boolean
  preservedTerms: string[]
}

// ============================================================================
// LIMITATIONS (for grounding)
// ============================================================================

export interface ResponseLimitations {
  missingData: string[]
  availableData: string[]
}

// ============================================================================
// RESPONSE CONTENT TYPES
// ============================================================================

export interface BaseResponse {
  id: string
  validationId?: string
  userId?: string
  intent: DetectedIntent
  content: string
  contentHtml?: string
  sources: Source[]
  confidence: ConfidenceLevel
  confidenceReason: string
  suggestions: Suggestion[]
  metadata: AssistantMetadata
}

export interface ErrorAnalysisResponse extends BaseResponse {
  intent: DetectedIntent & { detected: 'ERROR_ANALYSIS' }
}

export interface RuleExplanationResponse extends BaseResponse {
  intent: DetectedIntent & { detected: 'RULE_EXPLANATION' }
  ruleDetail: RuleDetail
}

export interface CorrectionAdvisorResponse extends BaseResponse {
  intent: DetectedIntent & { detected: 'CORRECTION_ADVISOR' }
  corrections: Correction[]
  impactEstimate: ImpactEstimate
}

export interface AnomalyDetectorResponse extends BaseResponse {
  intent: DetectedIntent & { detected: 'ANOMALY_DETECTOR' }
  anomalies: Anomaly[]
  alertLevel: AlertLevel
}

export interface TranslatorResponse extends BaseResponse {
  intent: DetectedIntent & { detected: 'TRANSLATOR' }
  translation: Translation
}

export interface GroundedResponse extends BaseResponse {
  intent: DetectedIntent & { detected: 'SYSTEM_BASE' }
  limitations: ResponseLimitations
}

export type AssistantResponseContent =
  | ErrorAnalysisResponse
  | RuleExplanationResponse
  | CorrectionAdvisorResponse
  | AnomalyDetectorResponse
  | TranslatorResponse
  | GroundedResponse
  | BaseResponse

// ============================================================================
// API RESPONSES
// ============================================================================

export interface AssistantSuccessResponse {
  success: true
  timestamp: string
  processingTime: number
  response: AssistantResponseContent
}

export interface AssistantErrorResponse {
  success: false
  timestamp: string
  processingTime: number
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
}

export type AssistantResponse = AssistantSuccessResponse | AssistantErrorResponse

// ============================================================================
// REQUEST TYPES
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface SendMessageRequest {
  validationId: string
  userId: string
  message: string
  language?: SupportedLanguage
  conversationHistory?: ChatMessage[]
  options?: {
    includeExplanations?: boolean
    maxSuggestions?: number
    confidenceThreshold?: number
  }
}

export interface ChatHistoryRequest {
  validationId: string
  userId?: string
  limit?: number
  offset?: number
}
