/**
 * REGALICA AI - Chat API Route
 * POST /api/ai/chat
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAssistantAI } from '../../../../services/ai/assistant'
import { verifyToken, getTokenFromHeader } from '../../../../lib/auth'
import type { SendMessageRequest } from '../../../../types/ai/assistant.types'
import type {
  ValidationMetadata,
  ValidationStatistics,
  RuleResult,
} from '../../../../types/ai/validator.types'

interface ChatRequestBody extends SendMessageRequest {
  context?: {
    metadata?: ValidationMetadata
    statistics?: ValidationStatistics
    results?: RuleResult[]
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()

  try {
    // Verify authentication
    const authHeader = req.headers.get('authorization')
    const token = getTokenFromHeader(authHeader)

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Token manquant',
          },
        },
        { status: 401 }
      )
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Token invalide ou expiré',
          },
        },
        { status: 401 }
      )
    }

    // Parse request body
    const body: ChatRequestBody = await req.json()
    const { validationId, message, language, conversationHistory, context, options } = body

    if (!message) {
      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          error: {
            code: 'INVALID_INPUT',
            message: 'Message requis',
          },
        },
        { status: 400 }
      )
    }

    // Get assistant service
    const assistant = getAssistantAI()

    if (!assistant.isAvailable()) {
      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          error: {
            code: 'AI_UNAVAILABLE',
            message: 'Service Assistant AI non disponible. Vérifiez GEMINI_API_KEY.',
          },
        },
        { status: 503 }
      )
    }

    // Build context
    const defaultMetadata: ValidationMetadata = {
      codeBanque: 'UNKNOWN',
      dateAnnexe: new Date().toISOString().split('T')[0],
      codeAnnexe: 'UNKNOWN',
      annexeName: 'Annexe inconnue',
    }

    const defaultStatistics: ValidationStatistics = {
      totalRules: 0,
      okCount: 0,
      errorCount: 0,
      skippedCount: 0,
      conformityRate: 0,
      severityBreakdown: { SEVERE: 0, ROUNDING: 0 },
    }

    const assistantContext = {
      validationId: validationId || 'unknown',
      metadata: context?.metadata || defaultMetadata,
      statistics: context?.statistics || defaultStatistics,
      results: context?.results || [],
      errors: (context?.results || []).filter(r => r.status === 'ERROR'),
    }

    // Create request
    const chatRequest: SendMessageRequest = {
      validationId: validationId || 'unknown',
      userId: decoded.id,
      message,
      language,
      conversationHistory,
      options,
    }

    // Process message
    const result = await assistant.processMessage(
      chatRequest,
      assistantContext,
      {
        useCache: options?.includeExplanations ?? true,
      }
    )

    // Return result
    const status = result.success ? 200 : 400
    return NextResponse.json(result, { status })

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue'

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        processingTime: Date.now() - startTime,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ai/chat - Check service status
 */
export async function GET(): Promise<NextResponse> {
  const assistant = getAssistantAI()

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    service: 'Assistant AI',
    available: assistant.isAvailable(),
    version: '1.0.0',
    capabilities: [
      'ERROR_ANALYSIS',
      'RULE_EXPLANATION',
      'CORRECTION_ADVISOR',
      'ANOMALY_DETECTOR',
      'TRANSLATOR',
    ],
  })
}
