/**
 * Service de validation intelligente avec Gemini API
 * Utilise l'IA pour détecter les anomalies et les incohérences
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { APP_CONFIG } from '../config/app.config'
import { loadRDGRules, validateRuleAgainstData } from './rdgRulesService'

export interface SmartValidationRequest {
  validationId: string
  data: Record<string, unknown>
  metadata: {
    uploadId: string
    fileName: string
    fileSize: number
  }
}

export interface SmartValidationResult {
  validationId: string
  anomalies: Anomaly[]
  recommendations: string[]
  overallRisk: 'low' | 'medium' | 'high' | 'critical'
  confidenceScore: number
}

export interface Anomaly {
  type: 'inconsistency' | 'missing_data' | 'outlier' | 'format_error' | 'logic_error'
  severity: 'low' | 'medium' | 'high' | 'critical'
  field: string
  description: string
  suggestedValue?: unknown
  confidence: number
}

/**
 * Initialiser le client Gemini
 */
function getGeminiClient() {
  if (!APP_CONFIG.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY non configurée')
  }

  return new GoogleGenerativeAI(APP_CONFIG.GEMINI_API_KEY)
}

/**
 * Effectuer une validation intelligente avec Gemini
 */
export async function performSmartValidation(
  request: SmartValidationRequest
): Promise<SmartValidationResult> {
  try {
    if (!APP_CONFIG.RDG_ENABLE_SMART_VALIDATION) {
      return {
        validationId: request.validationId,
        anomalies: [],
        recommendations: [],
        overallRisk: 'low',
        confidenceScore: 0,
      }
    }

    const client = getGeminiClient()
    const model = client.getGenerativeModel({ model: APP_CONFIG.GEMINI_MODEL })

    // Préparer le prompt pour Gemini
    const prompt = buildValidationPrompt(request)

    // Appeler Gemini
    const response = await model.generateContent(prompt)
    const text = response.response.text()

    // Parser la réponse
    const result = parseGeminiResponse(text, request.validationId)

    return result
  } catch (error: any) {
    console.error('Erreur lors de la validation intelligente:', error.message)
    throw new Error(`Erreur de validation intelligente: ${error.message}`)
  }
}

/**
 * Construire le prompt pour Gemini
 */
function buildValidationPrompt(request: SmartValidationRequest): string {
  const dataJson = JSON.stringify(request.data, null, 2)

  return `Tu es un expert en validation de données bancaires tunisiennes (BCT).
Analyse les données suivantes et identifie les anomalies, les incohérences et les risques.

DONNÉES À ANALYSER:
${dataJson}

MÉTADONNÉES:
- Fichier: ${request.metadata.fileName}
- Taille: ${request.metadata.fileSize} bytes
- ID Validation: ${request.validationId}

INSTRUCTIONS:
1. Identifie les anomalies (incohérences, données manquantes, valeurs aberrantes, erreurs de format)
2. Pour chaque anomalie, indique:
   - Type (inconsistency, missing_data, outlier, format_error, logic_error)
   - Sévérité (low, medium, high, critical)
   - Champ affecté
   - Description détaillée
   - Confiance (0-100)
3. Fournis des recommandations d'amélioration
4. Évalue le risque global (low, medium, high, critical)
5. Fournis un score de confiance global (0-100)

RÉPONSE EN JSON:
{
  "anomalies": [
    {
      "type": "...",
      "severity": "...",
      "field": "...",
      "description": "...",
      "confidence": 85
    }
  ],
  "recommendations": ["..."],
  "overallRisk": "...",
  "confidenceScore": 90
}`
}

/**
 * Parser la réponse de Gemini
 */
function parseGeminiResponse(text: string, validationId: string): SmartValidationResult {
  try {
    // Extraire le JSON de la réponse
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Impossible de parser la réponse JSON')
    }

    const parsed = JSON.parse(jsonMatch[0])

    return {
      validationId,
      anomalies: parsed.anomalies || [],
      recommendations: parsed.recommendations || [],
      overallRisk: parsed.overallRisk || 'low',
      confidenceScore: parsed.confidenceScore || 0,
    }
  } catch (error: any) {
    console.error('Erreur lors du parsing de la réponse Gemini:', error.message)
    return {
      validationId,
      anomalies: [],
      recommendations: ['Impossible d\'analyser les données avec l\'IA'],
      overallRisk: 'medium',
      confidenceScore: 0,
    }
  }
}

/**
 * Valider les données contre les règles RDG
 */
export async function validateAgainstRDGRules(
  data: Record<string, unknown>
): Promise<{
  passed: number
  failed: number
  pending: number
  details: Array<{
    ruleId: string
    numRegle: number
    status: 'passed' | 'failed' | 'pending'
    message: string
  }>
}> {
  try {
    const rules = await loadRDGRules()
    const results = []

    let passed = 0
    let failed = 0
    let pending = 0

    // Valider chaque règle
    for (const rule of rules.slice(0, 100)) {
      // Limiter à 100 règles pour les tests
      const validation = await validateRuleAgainstData(rule, data)

      if (validation.passed) {
        passed++
        results.push({
          ruleId: rule.id,
          numRegle: rule.numRegle,
          status: 'passed' as const,
          message: validation.message,
        })
      } else {
        failed++
        results.push({
          ruleId: rule.id,
          numRegle: rule.numRegle,
          status: 'failed' as const,
          message: validation.message,
        })
      }
    }

    return {
      passed,
      failed,
      pending,
      details: results,
    }
  } catch (error: any) {
    console.error('Erreur lors de la validation RDG:', error.message)
    throw new Error(`Erreur de validation RDG: ${error.message}`)
  }
}

/**
 * Générer un rapport de validation
 */
export async function generateValidationReport(
  validationId: string,
  smartValidation: SmartValidationResult,
  rdgValidation: Awaited<ReturnType<typeof validateAgainstRDGRules>>
): Promise<{
  validationId: string
  timestamp: Date
  summary: {
    totalAnomalies: number
    criticalAnomalies: number
    overallRisk: string
    rdgComplianceRate: number
  }
  details: {
    smartValidation: SmartValidationResult
    rdgValidation: Awaited<ReturnType<typeof validateAgainstRDGRules>>
  }
}> {
  const criticalAnomalies = smartValidation.anomalies.filter((a) => a.severity === 'critical')
  const rdgComplianceRate =
    rdgValidation.passed + rdgValidation.failed > 0
      ? Math.round((rdgValidation.passed / (rdgValidation.passed + rdgValidation.failed)) * 100)
      : 0

  return {
    validationId,
    timestamp: new Date(),
    summary: {
      totalAnomalies: smartValidation.anomalies.length,
      criticalAnomalies: criticalAnomalies.length,
      overallRisk: smartValidation.overallRisk,
      rdgComplianceRate,
    },
    details: {
      smartValidation,
      rdgValidation,
    },
  }
}
