/**
 * REGALICA AI - Assistant AI Service
 * Service conversationnel pour l'aide à la validation
 */

import { GeminiClient, getGeminiClient } from '../core/geminiClient'
import { withRetry } from '../core/retryHandler'
import { getAICache } from '../core/cacheManager'
import { parseAssistantResponse, extractJSON } from '../core/responseParser'
import {
  INTENT_PATTERNS,
  buildIntentDetectionPrompt,
  buildErrorAnalysisPrompt,
  buildRuleExplanationPrompt,
  buildCorrectionPrompt,
  buildAnomalyPrompt,
  buildTranslationPrompt,
  buildGroundedResponsePrompt,
} from '../prompts/assistant.prompts'
import { generateId } from '../../../lib/utils'

import type {
  AssistantResponse,
  AssistantSuccessResponse,
  AssistantErrorResponse,
  AssistantResponseContent,
  BaseResponse,
  SendMessageRequest,
  IntentType,
  ConfidenceLevel,
  DetectedIntent,
  Source,
  Suggestion,
  AssistantMetadata,
  Anomaly,
  Correction,
  ImpactEstimate,
  Translation,
  ResponseLimitations,
} from '../../../types/ai/assistant.types'

import type {
  RuleResult,
  ValidationMetadata,
  ValidationStatistics,
} from '../../../types/ai/validator.types'

// ============================================================================
// TYPES
// ============================================================================

interface AssistantContext {
  validationId: string
  metadata: ValidationMetadata
  statistics: ValidationStatistics
  results: RuleResult[]
  errors: RuleResult[]
}

interface AssistantOptions {
  useCache?: boolean
  cacheTTL?: number
  maxRetries?: number
  temperature?: number
  fallbackEnabled?: boolean
}

// ============================================================================
// ASSISTANT AI SERVICE
// ============================================================================

export class AssistantAIService {
  private client: GeminiClient | null = null
  private defaultOptions: AssistantOptions = {
    useCache: true,
    cacheTTL: 10 * 60 * 1000, // 10 minutes
    maxRetries: 3,
    temperature: 0.3,
    fallbackEnabled: true,
  }

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
   * Process a user message
   */
  async processMessage(
    request: SendMessageRequest,
    context: AssistantContext,
    options: AssistantOptions = {}
  ): Promise<AssistantResponse> {
    const startTime = Date.now()
    const messageId = `msg_${generateId()}`
    const opts = { ...this.defaultOptions, ...options }

    try {
      if (!this.isAvailable()) {
        return this.createErrorResponse(
          messageId,
          'Service AI non disponible',
          'AI_UNAVAILABLE',
          startTime
        )
      }

      // Detect intent
      const intent = await this.detectIntent(request.message)

      // Route to appropriate handler
      const response = await this.routeToHandler(
        intent,
        request,
        context,
        opts
      )

      // Build success response
      const successResponse: AssistantSuccessResponse = {
        success: true,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        response: {
          id: messageId,
          validationId: request.validationId,
          userId: request.userId,
          ...response,
        },
      }

      return successResponse

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      return this.createErrorResponse(
        messageId,
        errorMessage,
        'PROCESSING_ERROR',
        startTime
      )
    }
  }

  /**
   * Detect user intent
   */
  async detectIntent(message: string): Promise<DetectedIntent> {
    const lowerMessage = message.toLowerCase()

    // Check pattern matches first (fast path)
    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      const matchCount = patterns.filter(p => lowerMessage.includes(p)).length
      if (matchCount >= 2 || (matchCount === 1 && patterns.length <= 3)) {
        return {
          detected: intent as IntentType,
          confidence: Math.min(0.95, 0.7 + matchCount * 0.1),
          keywords: patterns.filter(p => lowerMessage.includes(p)),
        }
      }
    }

    // Use AI for complex intent detection
    if (this.isAvailable()) {
      try {
        const prompt = buildIntentDetectionPrompt(message)
        const response = await this.client!.generateContent(prompt, true)
        const jsonStr = extractJSON(response)

        if (jsonStr) {
          const parsed = JSON.parse(jsonStr)
          return {
            detected: parsed.detected || 'UNKNOWN',
            confidence: parsed.confidence || 0.5,
            keywords: parsed.keywords || [],
          }
        }
      } catch {
        // Fall through to default
      }
    }

    return {
      detected: 'UNKNOWN',
      confidence: 0.3,
      keywords: [],
    }
  }

  /**
   * Route to appropriate handler based on intent
   */
  private async routeToHandler(
    intent: DetectedIntent,
    request: SendMessageRequest,
    context: AssistantContext,
    options: AssistantOptions
  ): Promise<Omit<AssistantResponseContent, 'id' | 'validationId' | 'userId'>> {
    switch (intent.detected) {
      case 'ERROR_ANALYSIS':
        return this.handleErrorAnalysis(request, context, intent, options)

      case 'RULE_EXPLANATION':
        return this.handleRuleExplanation(request, context, intent, options)

      case 'CORRECTION_ADVISOR':
        return this.handleCorrectionAdvice(request, context, intent, options)

      case 'ANOMALY_DETECTOR':
        return this.handleAnomalyDetection(request, context, intent, options)

      case 'TRANSLATOR':
        return this.handleTranslation(request, context, intent, options)

      case 'GREETING':
        return this.handleGreeting(context, intent)

      case 'UNKNOWN':
      case 'SYSTEM_BASE':
      default:
        return this.handleGenericQuery(request, context, intent, options)
    }
  }

  /**
   * Handle error analysis queries
   */
  private async handleErrorAnalysis(
    request: SendMessageRequest,
    context: AssistantContext,
    intent: DetectedIntent,
    options: AssistantOptions
  ): Promise<Omit<BaseResponse, 'id' | 'validationId' | 'userId'>> {
    const prompt = buildErrorAnalysisPrompt({
      metadata: context.metadata,
      statistics: context.statistics,
      errors: context.errors,
      userMessage: request.message,
    })

    const response = await this.callAI(prompt, options)
    const parsed = parseAssistantResponse(response)

    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.error || 'Failed to parse response')
    }

    return {
      intent,
      content: parsed.data.content,
      sources: this.buildSources(context.errors),
      confidence: parsed.data.confidence || 'CERTAIN',
      confidenceReason: 'Données explicites dans les résultats de validation',
      suggestions: parsed.data.suggestions || this.getDefaultSuggestions('ERROR_ANALYSIS'),
      metadata: this.buildMetadata('ERROR_ANALYSIS', options),
    }
  }

  /**
   * Handle rule explanation queries
   */
  private async handleRuleExplanation(
    request: SendMessageRequest,
    context: AssistantContext,
    intent: DetectedIntent,
    options: AssistantOptions
  ): Promise<Omit<BaseResponse, 'id' | 'validationId' | 'userId'>> {
    // Extract rule number from message
    const ruleMatch = request.message.match(/r[eè]gle\s*(\d+)/i) ||
                      request.message.match(/(\d+)/i)
    const ruleNum = ruleMatch ? parseInt(ruleMatch[1]) : null

    // Find the rule
    const rule = ruleNum
      ? context.results.find(r => r.numRegle === ruleNum)
      : context.errors[0]

    if (!rule) {
      return this.handleGroundedResponse(
        request.message,
        ['résultats de validation', 'liste des règles'],
        intent
      )
    }

    const prompt = buildRuleExplanationPrompt({
      rule,
      userMessage: request.message,
    })

    const response = await this.callAI(prompt, options)
    const parsed = parseAssistantResponse(response)

    if (!parsed.success || !parsed.data) {
      throw new Error(parsed.error || 'Failed to parse response')
    }

    return {
      intent,
      content: parsed.data.content,
      sources: [
        {
          type: 'validation_result',
          numRegle: rule.numRegle,
          reference: `Résultat validation règle ${rule.numRegle}`,
        },
        {
          type: 'rule_definition',
          numRegle: rule.numRegle,
          reference: `Définition règle ${rule.numRegle}`,
        },
      ],
      confidence: 'CERTAIN',
      confidenceReason: 'Règle trouvée dans les résultats',
      suggestions: this.getDefaultSuggestions('RULE_EXPLANATION'),
      metadata: this.buildMetadata('RULE_EXPLANATION', options),
    }
  }

  /**
   * Handle correction advice queries
   */
  private async handleCorrectionAdvice(
    request: SendMessageRequest,
    context: AssistantContext,
    intent: DetectedIntent,
    options: AssistantOptions
  ): Promise<Omit<BaseResponse, 'id' | 'validationId' | 'userId'> & {
    corrections: Correction[]
    impactEstimate: ImpactEstimate
  }> {
    const prompt = buildCorrectionPrompt({
      errors: context.errors,
      metadata: context.metadata,
      userMessage: request.message,
    })

    const response = await this.callAI(prompt, options)
    const jsonStr = extractJSON(response)

    let corrections: Correction[] = []
    let impactEstimate: ImpactEstimate = {
      currentConformity: context.statistics.conformityRate,
      projectedConformity: 100,
      errorsRemaining: 0,
    }
    let content = response

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        corrections = parsed.corrections || []
        impactEstimate = parsed.impactEstimate || impactEstimate
        content = parsed.content || response
      } catch {
        // Use raw response
      }
    }

    return {
      intent,
      content,
      corrections,
      impactEstimate,
      sources: this.buildSources(context.errors),
      confidence: 'PROBABLE',
      confidenceReason: 'Corrections basées sur les calculs, vérification recommandée',
      suggestions: this.getDefaultSuggestions('CORRECTION_ADVISOR'),
      metadata: this.buildMetadata('CORRECTION_ADVISOR', options),
    }
  }

  /**
   * Handle anomaly detection queries
   */
  private async handleAnomalyDetection(
    request: SendMessageRequest,
    context: AssistantContext,
    intent: DetectedIntent,
    options: AssistantOptions
  ): Promise<Omit<BaseResponse, 'id' | 'validationId' | 'userId'> & {
    anomalies: Anomaly[]
    alertLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  }> {
    const prompt = buildAnomalyPrompt({
      results: context.results,
      metadata: context.metadata,
      userMessage: request.message,
    })

    const response = await this.callAI(prompt, options)
    const jsonStr = extractJSON(response)

    let anomalies: Anomaly[] = []
    let alertLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'
    let content = response

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        anomalies = parsed.anomalies || []
        alertLevel = parsed.alertLevel || 'LOW'
        content = parsed.content || response
      } catch {
        // Use raw response
      }
    }

    return {
      intent,
      content,
      anomalies,
      alertLevel,
      sources: [],
      confidence: 'INCERTAIN',
      confidenceReason: 'Hypothèses basées sur des patterns statistiques',
      suggestions: this.getDefaultSuggestions('ANOMALY_DETECTOR'),
      metadata: this.buildMetadata('ANOMALY_DETECTOR', options),
    }
  }

  /**
   * Handle translation queries
   */
  private async handleTranslation(
    request: SendMessageRequest,
    context: AssistantContext,
    intent: DetectedIntent,
    options: AssistantOptions
  ): Promise<Omit<BaseResponse, 'id' | 'validationId' | 'userId'> & {
    translation: Translation
  }> {
    // Detect target language
    const isArabic = request.message.includes('arabe') ||
                     request.message.includes('عربي') ||
                     request.language === 'ar'

    const targetLang = isArabic ? 'ar' : 'en'

    // Get text to translate (last assistant response or error summary)
    const textToTranslate = context.errors.length > 0
      ? `Résumé: ${context.errors.length} erreurs détectées sur ${context.statistics.totalRules} règles.`
      : `Validation réussie avec un taux de conformité de ${context.statistics.conformityRate}%.`

    const prompt = buildTranslationPrompt({
      sourceText: textToTranslate,
      targetLanguage: targetLang,
      preserveTerms: ['BCT', 'RDG', 'TND'],
    })

    const response = await this.callAI(prompt, options)
    const jsonStr = extractJSON(response)

    let translation: Translation = {
      sourceLanguage: 'fr',
      targetLanguage: targetLang,
      sourceText: textToTranslate,
      translatedText: response,
      rtl: targetLang === 'ar',
      preservedTerms: ['BCT', 'RDG', 'TND'],
    }
    let content = response

    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr)
        translation = parsed.translation || translation
        content = parsed.content || response
      } catch {
        // Use raw response
      }
    }

    return {
      intent,
      content,
      translation,
      sources: [],
      confidence: 'CERTAIN',
      confidenceReason: 'Traduction directe',
      suggestions: [],
      metadata: this.buildMetadata('TRANSLATOR', options),
    }
  }

  /**
   * Handle greeting
   */
  private handleGreeting(
    context: AssistantContext,
    intent: DetectedIntent
  ): Omit<BaseResponse, 'id' | 'validationId' | 'userId'> {
    const content = `Bonjour ! Je suis l'assistant REGALICA.

Je suis là pour vous aider avec la validation de votre fichier **${context.metadata.annexeName}**.

### Résumé Rapide
- **Règles analysées**: ${context.statistics.totalRules}
- **Taux de conformité**: ${context.statistics.conformityRate}%
- **Erreurs**: ${context.statistics.errorCount}

Comment puis-je vous aider ?`

    return {
      intent,
      content,
      sources: [],
      confidence: 'CERTAIN',
      confidenceReason: 'Réponse standard',
      suggestions: [
        { text: 'Analyse mes erreurs', intent: 'ERROR_ANALYSIS' },
        { text: 'Comment corriger les erreurs ?', intent: 'CORRECTION_ADVISOR' },
        { text: 'Y a-t-il des anomalies ?', intent: 'ANOMALY_DETECTOR' },
      ],
      metadata: this.buildMetadata('GREETING', { temperature: 0.1 }),
    }
  }

  /**
   * Handle generic/unknown queries
   */
  private async handleGenericQuery(
    request: SendMessageRequest,
    context: AssistantContext,
    intent: DetectedIntent,
    options: AssistantOptions
  ): Promise<Omit<BaseResponse, 'id' | 'validationId' | 'userId'>> {
    // Check if we have relevant data
    const hasData = context.results.length > 0

    if (!hasData) {
      return this.handleGroundedResponse(
        request.message,
        ['résultats de validation'],
        intent
      )
    }

    // Try error analysis as default
    return this.handleErrorAnalysis(request, context, intent, options)
  }

  /**
   * Handle grounded response (I don't know)
   */
  private handleGroundedResponse(
    userMessage: string,
    availableData: string[],
    intent: DetectedIntent
  ): Omit<BaseResponse, 'id' | 'validationId' | 'userId'> & {
    limitations: ResponseLimitations
  } {
    const content = `Je ne dispose pas de cette information dans les données de validation actuelles.

### Ce que je peux vous dire
${availableData.map(d => `- J'ai accès aux ${d}`).join('\n')}

### Pour obtenir cette information
- Consultez la circulaire BCT correspondante
- Contactez votre département conformité

Puis-je vous aider avec autre chose concernant votre validation ?`

    return {
      intent: { ...intent, detected: 'SYSTEM_BASE' },
      content,
      limitations: {
        missingData: ['information demandée non disponible'],
        availableData,
      },
      sources: [],
      confidence: 'CERTAIN',
      confidenceReason: 'Information explicitement absente du contexte',
      suggestions: [
        { text: 'Analyse mes erreurs', intent: 'ERROR_ANALYSIS' },
        { text: 'Explique une règle', intent: 'RULE_EXPLANATION' },
      ],
      metadata: this.buildMetadata('SYSTEM_BASE', { temperature: 0.1 }),
    }
  }

  /**
   * Call AI with retry and cache
   */
  private async callAI(prompt: string, options: AssistantOptions): Promise<string> {
    const cache = getAICache()

    // Check cache
    if (options.useCache) {
      const cached = cache.get<string>(prompt)
      if (cached) {
        return cached
      }
    }

    // Call AI
    const response = await withRetry(
      async () => {
        const model = this.client!.getModel()
        const result = await model.generateContent(prompt)
        return result.response.text()
      },
      { maxRetries: options.maxRetries || 3 }
    )

    // Cache response
    if (options.useCache) {
      cache.set(prompt, response, undefined, options.cacheTTL)
    }

    return response
  }

  /**
   * Build sources from errors
   */
  private buildSources(errors: RuleResult[]): Source[] {
    return errors.slice(0, 5).map(e => ({
      type: 'validation_result' as const,
      numRegle: e.numRegle,
      reference: `Règle ${e.numRegle} - Écart ${e.calculation.ecart}`,
    }))
  }

  /**
   * Build metadata
   */
  private buildMetadata(
    promptType: IntentType,
    options: AssistantOptions
  ): AssistantMetadata {
    return {
      model: this.client?.getConfig().model || 'gemini-1.5-flash',
      fallback: false,
      tokensUsed: 0, // Would be calculated in production
      promptType,
      temperature: options.temperature || 0.3,
      cached: false,
    }
  }

  /**
   * Get default suggestions for intent
   */
  private getDefaultSuggestions(intent: IntentType): Suggestion[] {
    const suggestions: Record<IntentType, Suggestion[]> = {
      ERROR_ANALYSIS: [
        { text: 'Explique la règle avec le plus grand écart', intent: 'RULE_EXPLANATION' },
        { text: 'Comment corriger ces erreurs ?', intent: 'CORRECTION_ADVISOR' },
      ],
      RULE_EXPLANATION: [
        { text: 'Comment corriger cette erreur ?', intent: 'CORRECTION_ADVISOR' },
        { text: 'Y a-t-il des anomalies liées ?', intent: 'ANOMALY_DETECTOR' },
      ],
      CORRECTION_ADVISOR: [
        { text: 'Explique une autre règle', intent: 'RULE_EXPLANATION' },
        { text: 'Vérifie les anomalies', intent: 'ANOMALY_DETECTOR' },
      ],
      ANOMALY_DETECTOR: [
        { text: 'Analyse les erreurs', intent: 'ERROR_ANALYSIS' },
        { text: 'Comment corriger ?', intent: 'CORRECTION_ADVISOR' },
      ],
      TRANSLATOR: [],
      SYSTEM_BASE: [
        { text: 'Analyse mes erreurs', intent: 'ERROR_ANALYSIS' },
      ],
      GREETING: [
        { text: 'Analyse mes erreurs', intent: 'ERROR_ANALYSIS' },
        { text: 'Explique mes résultats', intent: 'RULE_EXPLANATION' },
      ],
      UNKNOWN: [
        { text: 'Analyse mes erreurs', intent: 'ERROR_ANALYSIS' },
      ],
    }

    return suggestions[intent] || []
  }

  /**
   * Create error response
   */
  private createErrorResponse(
    messageId: string,
    message: string,
    code: string,
    startTime: number
  ): AssistantErrorResponse {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      processingTime: Date.now() - startTime,
      error: {
        code,
        message,
      },
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let assistantInstance: AssistantAIService | null = null

export function getAssistantAI(): AssistantAIService {
  if (!assistantInstance) {
    assistantInstance = new AssistantAIService()
  }
  return assistantInstance
}

export { AssistantAIService }
