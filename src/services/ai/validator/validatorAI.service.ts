/**
 * REGALICA AI - Validator AI Service
 * Service principal de validation des reportings bancaires
 */

import { GeminiClient, getGeminiClient } from '../core/geminiClient'
import { withRetry } from '../core/retryHandler'
import { getAICache } from '../core/cacheManager'
import { parseValidatorResponse, extractJSON } from '../core/responseParser'
import { buildValidationPrompt, buildErrorAnalysisPrompt } from '../prompts/validator.prompts'
import { generateId } from '../../../lib/utils'

import type {
  ValidatorResponse,
  ValidatorSuccessResponse,
  ValidatorErrorResponse,
  ValidateRequest,
  ValidationMetadata,
  ValidationStatistics,
  RuleResult,
  ValidationSummary,
  DomainSummary,
  SeveritySummary,
  TopError,
  Severity,
  RuleStatus,
  ErrorCode,
} from '../../../types/ai/validator.types'

// ============================================================================
// TYPES
// ============================================================================

interface ValidationOptions {
  useCache?: boolean
  cacheTTL?: number
  maxRetries?: number
  timeout?: number
}

interface RuleDefinition {
  numRegle: number
  domaine: string
  annexe: string
  zoneTexte: string
  operator: string
  leftTerms: string
  rightTerms: string
}

// ============================================================================
// VALIDATOR AI SERVICE
// ============================================================================

export class ValidatorAIService {
  private client: GeminiClient | null = null

  constructor() {
    this.client = getGeminiClient()
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.client !== null && GeminiClient.isAvailable()
  }

  /**
   * Validate a file against RDG rules
   */
  async validate(
    request: ValidateRequest,
    xmlContent: string,
    rules: RuleDefinition[],
    options: ValidationOptions = {}
  ): Promise<ValidatorResponse> {
    const startTime = Date.now()
    const validationId = `val_${generateId()}`

    try {
      // Check if AI is available
      if (!this.isAvailable()) {
        return this.createErrorResponse(
          validationId,
          'GEMINI_API_KEY non configurée',
          'DATABASE_ERROR' as ErrorCode,
          startTime
        )
      }

      // Extract metadata from XML
      const metadata = this.extractMetadata(xmlContent, request.fileName)

      // Build and execute validation
      const results = await this.executeValidation(
        metadata,
        xmlContent,
        rules,
        options
      )

      // Calculate statistics
      const statistics = this.calculateStatistics(results)

      // Generate summary
      const summary = this.generateSummary(results)

      // Create success response
      const response: ValidatorSuccessResponse = {
        success: true,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        validation: {
          id: validationId,
          tenantId: request.tenantId,
          userId: request.userId,
          file: {
            name: request.fileName,
            size: request.fileSize,
            url: request.fileUrl,
            uploadedAt: new Date().toISOString(),
          },
          metadata,
          statistics,
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
        results,
        summary,
      }

      return response

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return this.createErrorResponse(
        validationId,
        errorMessage,
        this.classifyError(errorMessage),
        startTime
      )
    }
  }

  /**
   * Execute validation with AI
   */
  private async executeValidation(
    metadata: ValidationMetadata,
    xmlContent: string,
    rules: RuleDefinition[],
    options: ValidationOptions
  ): Promise<RuleResult[]> {
    const cache = getAICache()
    const cacheKey = `validation_${metadata.codeAnnexe}_${metadata.codeBanque}_${metadata.dateAnnexe}`

    // Check cache
    if (options.useCache !== false) {
      const cached = cache.get<RuleResult[]>(cacheKey)
      if (cached) {
        return cached
      }
    }

    // Build prompt
    const prompt = buildValidationPrompt({
      metadata,
      xmlData: xmlContent,
      rules,
    })

    // Call AI with retry
    const response = await withRetry(
      async () => {
        const model = this.client!.getJsonModel()
        const result = await model.generateContent(prompt)
        return result.response.text()
      },
      { maxRetries: options.maxRetries || 3 }
    )

    // Parse response
    const parseResult = parseValidatorResponse(response)

    if (!parseResult.success || !parseResult.data) {
      throw new Error(parseResult.error || 'Failed to parse validation response')
    }

    // Cache results
    if (options.useCache !== false) {
      cache.set(cacheKey, parseResult.data, undefined, options.cacheTTL)
    }

    return parseResult.data
  }

  /**
   * Extract metadata from XML content
   */
  private extractMetadata(xmlContent: string, fileName: string): ValidationMetadata {
    // Simple regex extraction (would use proper XML parser in production)
    const codeBanqueMatch = xmlContent.match(/<CodeBanque>(\d+)<\/CodeBanque>/i)
    const dateAnnexeMatch = xmlContent.match(/<DateAnnexe>([^<]+)<\/DateAnnexe>/i)
    const codeAnnexeMatch = xmlContent.match(/<CodeAnnexe>(\d+)<\/CodeAnnexe>/i)

    // Extract code from filename if not in XML
    const fileCodeMatch = fileName.match(/(\d{3})\.xml$/i)

    return {
      codeBanque: codeBanqueMatch?.[1] || 'UNKNOWN',
      dateAnnexe: dateAnnexeMatch?.[1] || new Date().toISOString().split('T')[0],
      codeAnnexe: codeAnnexeMatch?.[1] || fileCodeMatch?.[1] || 'UNKNOWN',
      annexeName: this.getAnnexeName(codeAnnexeMatch?.[1] || fileCodeMatch?.[1] || ''),
    }
  }

  /**
   * Get annexe name from code
   */
  private getAnnexeName(code: string): string {
    const annexeNames: Record<string, string> = {
      '484': 'Situation des engagements',
      '485': 'Situation des dépôts',
      '486': 'Situation des crédits',
      '620': 'Ratio de solvabilité',
      // Add more as needed
    }
    return annexeNames[code] || `Annexe ${code}`
  }

  /**
   * Calculate validation statistics
   */
  private calculateStatistics(results: RuleResult[]): ValidationStatistics {
    const okCount = results.filter(r => r.status === 'OK').length
    const errorCount = results.filter(r => r.status === 'ERROR').length
    const skippedCount = results.filter(r => r.status === 'SKIPPED').length

    const severeCount = results.filter(r => r.severity === 'SEVERE').length
    const roundingCount = results.filter(r => r.severity === 'ROUNDING').length

    const totalRules = results.length
    const conformityRate = totalRules > 0
      ? Math.round((okCount / totalRules) * 10000) / 100
      : 0

    return {
      totalRules,
      okCount,
      errorCount,
      skippedCount,
      conformityRate,
      severityBreakdown: {
        SEVERE: severeCount,
        ROUNDING: roundingCount,
      },
    }
  }

  /**
   * Generate validation summary
   */
  private generateSummary(results: RuleResult[]): ValidationSummary {
    // Group by domain
    const byDomain = new Map<string, RuleResult[]>()
    for (const result of results) {
      const existing = byDomain.get(result.domaine) || []
      existing.push(result)
      byDomain.set(result.domaine, existing)
    }

    const domainSummaries: DomainSummary[] = []
    for (const [domaine, domainResults] of byDomain) {
      const ok = domainResults.filter(r => r.status === 'OK').length
      const error = domainResults.filter(r => r.status === 'ERROR').length
      const skipped = domainResults.filter(r => r.status === 'SKIPPED').length
      const total = domainResults.length

      domainSummaries.push({
        domaine,
        total,
        ok,
        error,
        skipped,
        conformityRate: total > 0 ? Math.round((ok / total) * 10000) / 100 : 0,
      })
    }

    // Group by severity
    const bySeverity: SeveritySummary[] = []
    const severeResults = results.filter(r => r.severity === 'SEVERE')
    const roundingResults = results.filter(r => r.severity === 'ROUNDING')

    if (severeResults.length > 0) {
      bySeverity.push({
        severity: 'SEVERE',
        count: severeResults.length,
        rules: severeResults.map(r => r.numRegle),
      })
    }

    if (roundingResults.length > 0) {
      bySeverity.push({
        severity: 'ROUNDING',
        count: roundingResults.length,
        rules: roundingResults.map(r => r.numRegle),
      })
    }

    // Top errors by absolute deviation
    const errors = results
      .filter(r => r.status === 'ERROR' && r.calculation.ecartAbsolu)
      .sort((a, b) => {
        const aVal = parseFloat(a.calculation.ecartAbsolu || '0')
        const bVal = parseFloat(b.calculation.ecartAbsolu || '0')
        return bVal - aVal
      })
      .slice(0, 5)

    const topErrors: TopError[] = errors.map(e => ({
      numRegle: e.numRegle,
      ecartAbsolu: e.calculation.ecartAbsolu || '0',
      domaine: e.domaine,
    }))

    return {
      byDomain: domainSummaries,
      bySeverity,
      topErrors,
    }
  }

  /**
   * Classify error type
   */
  private classifyError(message: string): ErrorCode {
    const lowerMessage = message.toLowerCase()

    if (lowerMessage.includes('parse') || lowerMessage.includes('xml')) {
      return 'XML_PARSE_ERROR'
    }
    if (lowerMessage.includes('structure')) {
      return 'XML_INVALID_STRUCTURE'
    }
    if (lowerMessage.includes('header')) {
      return 'XML_MISSING_HEADER'
    }
    if (lowerMessage.includes('codeannexe')) {
      return 'XML_MISSING_CODE_ANNEXE'
    }
    if (lowerMessage.includes('codebanque')) {
      return 'XML_MISSING_CODE_BANQUE'
    }
    if (lowerMessage.includes('dateannexe')) {
      return 'XML_MISSING_DATE_ANNEXE'
    }
    if (lowerMessage.includes('rule') || lowerMessage.includes('règle')) {
      return 'RULES_NOT_FOUND'
    }
    if (lowerMessage.includes('timeout')) {
      return 'TIMEOUT'
    }
    if (lowerMessage.includes('database') || lowerMessage.includes('db')) {
      return 'DATABASE_ERROR'
    }
    if (lowerMessage.includes('calculation') || lowerMessage.includes('calcul')) {
      return 'CALCULATION_ERROR'
    }
    if (lowerMessage.includes('overflow')) {
      return 'DECIMAL_OVERFLOW'
    }
    if (lowerMessage.includes('division')) {
      return 'DIVISION_BY_ZERO'
    }

    return 'CALCULATION_ERROR'
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    validationId: string,
    message: string,
    code: ErrorCode,
    startTime: number
  ): ValidatorErrorResponse {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime,
      validation: {
        id: validationId,
        status: 'failed',
      },
      error: {
        code,
        message,
      },
    }
  }

  /**
   * Analyze errors in detail
   */
  async analyzeErrors(
    errors: RuleResult[],
    metadata: ValidationMetadata
  ): Promise<{
    analysis: Array<{
      numRegle: number
      causeProbable: string
      rubriquesAVerifier: string[]
      actionCorrective: string
      impactAutresRegles: number[]
      priorite: 'HIGH' | 'MEDIUM' | 'LOW'
    }>
    summary: string
    recommendationGlobale: string
  }> {
    if (!this.isAvailable()) {
      throw new Error('AI service not available')
    }

    const prompt = buildErrorAnalysisPrompt(errors, metadata)

    const response = await withRetry(async () => {
      const model = this.client!.getJsonModel()
      const result = await model.generateContent(prompt)
      return result.response.text()
    })

    const jsonStr = extractJSON(response)
    if (!jsonStr) {
      throw new Error('Failed to parse error analysis response')
    }

    return JSON.parse(jsonStr)
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let validatorInstance: ValidatorAIService | null = null

export function getValidatorAI(): ValidatorAIService {
  if (!validatorInstance) {
    validatorInstance = new ValidatorAIService()
  }
  return validatorInstance
}

export { ValidatorAIService }
