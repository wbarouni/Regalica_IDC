/**
 * REGALICA AI - Response Parser
 * Parsing et validation des réponses AI
 */

import { z } from 'zod'

// ============================================================================
// VALIDATOR SCHEMAS
// ============================================================================

const RuleTermSchema = z.object({
  rangTerm: z.number(),
  numSeq: z.number(),
  rubrique: z.string(),
  colonne: z.string().nullable(),
  operTermRegle: z.string(),
  axOrigine: z.string(),
  valeur: z.string().nullable(),
  source: z.enum(['XML', 'CONSTANTE', 'MISSING', 'CALCULATED']),
})

const RuleCalculationSchema = z.object({
  calculee: z.string().nullable(),
  attendue: z.string().nullable(),
  ecart: z.string().nullable(),
  ecartAbsolu: z.string().nullable(),
  ecartRelatif: z.string().nullable(),
})

const RuleResultSchema = z.object({
  numRegle: z.number(),
  ruleId: z.string(),
  domaine: z.string(),
  annexe: z.string(),
  zoneTexte: z.string(),
  operator: z.string(),
  calculation: RuleCalculationSchema,
  status: z.enum(['OK', 'ERROR', 'SKIPPED']),
  severity: z.enum(['SEVERE', 'ROUNDING']).nullable(),
  skipReason: z.string().optional(),
  terms: z.object({
    calculee: z.array(RuleTermSchema),
    attendue: z.array(RuleTermSchema),
  }),
})

// ============================================================================
// ASSISTANT SCHEMAS
// ============================================================================

const AnomalySchema = z.object({
  id: z.number(),
  type: z.enum([
    'INVERSION_CHIFFRES',
    'CHIFFRES_RONDS_SUSPECTS',
    'VALEUR_NEGATIVE_ANORMALE',
    'DOUBLON_POTENTIEL',
    'PATTERN_SUSPECT',
    'VARIATION_EXTREME',
  ]),
  numRegle: z.number().nullable(),
  rubrique: z.string().nullable(),
  probability: z.number().min(0).max(1),
  impact: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  hypothesis: z.string(),
})

const CorrectionSchema = z.object({
  numRegle: z.number(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  effort: z.enum(['EASY', 'MEDIUM', 'HARD']),
  rubrique: z.string(),
  colonne: z.string(),
  valeurActuelle: z.string(),
  valeurCorrigee: z.string(),
  ecart: z.string(),
  action: z.enum(['MODIFY', 'ADD', 'DELETE', 'VERIFY']),
  warning: z.string().nullable(),
})

const SuggestionSchema = z.object({
  text: z.string(),
  intent: z.string(),
})

const SourceSchema = z.object({
  type: z.string(),
  numRegle: z.number().optional(),
  similarity: z.number().optional(),
  reference: z.string(),
})

const AssistantContentSchema = z.object({
  content: z.string(),
  confidence: z.enum(['CERTAIN', 'PROBABLE', 'INCERTAIN']),
  confidenceReason: z.string().optional(),
  suggestions: z.array(SuggestionSchema).optional(),
  sources: z.array(SourceSchema).optional(),
  anomalies: z.array(AnomalySchema).optional(),
  corrections: z.array(CorrectionSchema).optional(),
  alertLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
})

// ============================================================================
// PARSER FUNCTIONS
// ============================================================================

export interface ParseResult<T> {
  success: boolean
  data?: T
  error?: string
  rawResponse?: string
}

/**
 * Extract JSON from a text response
 */
export function extractJSON(text: string): string | null {
  // Try to find a JSON object
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    // Verify it's valid JSON
    try {
      JSON.parse(objectMatch[0])
      return objectMatch[0]
    } catch {
      // Try to fix common issues
      const fixed = fixCommonJSONIssues(objectMatch[0])
      try {
        JSON.parse(fixed)
        return fixed
      } catch {
        // Continue to array check
      }
    }
  }

  // Try to find a JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    try {
      JSON.parse(arrayMatch[0])
      return arrayMatch[0]
    } catch {
      const fixed = fixCommonJSONIssues(arrayMatch[0])
      try {
        JSON.parse(fixed)
        return fixed
      } catch {
        // Return null
      }
    }
  }

  return null
}

/**
 * Fix common JSON formatting issues from AI responses
 */
function fixCommonJSONIssues(json: string): string {
  let fixed = json

  // Remove trailing commas before } or ]
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1')

  // Fix unescaped quotes in strings (simple cases)
  // This is a simplified fix and may not cover all cases
  fixed = fixed.replace(/: "([^"]*)"([^",}\]]*)"([^"]*)",/g, ': "$1\\"$2\\"$3",')

  // Remove control characters
  fixed = fixed.replace(/[\x00-\x1F\x7F]/g, (char) => {
    if (char === '\n' || char === '\r' || char === '\t') {
      return char
    }
    return ''
  })

  return fixed
}

/**
 * Parse validator response
 */
export function parseValidatorResponse(
  responseText: string
): ParseResult<z.infer<typeof RuleResultSchema>[]> {
  try {
    const jsonStr = extractJSON(responseText)
    if (!jsonStr) {
      return {
        success: false,
        error: 'No valid JSON found in response',
        rawResponse: responseText,
      }
    }

    const parsed = JSON.parse(jsonStr)

    // Handle both array and object with results property
    const results = Array.isArray(parsed) ? parsed : parsed.results

    if (!Array.isArray(results)) {
      return {
        success: false,
        error: 'Response does not contain an array of results',
        rawResponse: responseText,
      }
    }

    // Validate each result
    const validatedResults = []
    for (const result of results) {
      const validation = RuleResultSchema.safeParse(result)
      if (validation.success) {
        validatedResults.push(validation.data)
      }
    }

    return {
      success: true,
      data: validatedResults,
    }
  } catch (error) {
    return {
      success: false,
      error: `Parse error: ${(error as Error).message}`,
      rawResponse: responseText,
    }
  }
}

/**
 * Parse assistant response
 */
export function parseAssistantResponse(
  responseText: string
): ParseResult<z.infer<typeof AssistantContentSchema>> {
  try {
    const jsonStr = extractJSON(responseText)
    if (!jsonStr) {
      // If no JSON, treat the entire response as content
      return {
        success: true,
        data: {
          content: responseText.trim(),
          confidence: 'PROBABLE',
        },
      }
    }

    const parsed = JSON.parse(jsonStr)
    const validation = AssistantContentSchema.safeParse(parsed)

    if (!validation.success) {
      // Return partial data even if validation fails
      return {
        success: true,
        data: {
          content: parsed.content || responseText,
          confidence: parsed.confidence || 'PROBABLE',
          confidenceReason: parsed.confidenceReason,
          suggestions: parsed.suggestions,
          sources: parsed.sources,
          anomalies: parsed.anomalies,
          corrections: parsed.corrections,
          alertLevel: parsed.alertLevel,
        },
      }
    }

    return {
      success: true,
      data: validation.data,
    }
  } catch (error) {
    return {
      success: false,
      error: `Parse error: ${(error as Error).message}`,
      rawResponse: responseText,
    }
  }
}

/**
 * Safely parse any JSON with fallback
 */
export function safeParseJSON<T>(
  text: string,
  fallback: T
): { data: T; parsed: boolean } {
  try {
    const jsonStr = extractJSON(text)
    if (!jsonStr) {
      return { data: fallback, parsed: false }
    }
    return { data: JSON.parse(jsonStr), parsed: true }
  } catch {
    return { data: fallback, parsed: false }
  }
}

export { RuleResultSchema, AssistantContentSchema, AnomalySchema, CorrectionSchema }
