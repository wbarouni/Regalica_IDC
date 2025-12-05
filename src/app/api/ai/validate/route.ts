/**
 * REGALICA AI - Validation API Route
 * POST /api/ai/validate
 */

import { NextRequest, NextResponse } from 'next/server'
import { getValidatorAI } from '../../../../services/ai/validator'
import { verifyToken, getTokenFromHeader } from '../../../../lib/auth'
import type { ValidateRequest } from '../../../../types/ai/validator.types'

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
    const body = await req.json()
    const {
      fileUrl,
      fileName,
      fileSize,
      xmlContent,
      rules,
      options,
    } = body

    if (!xmlContent) {
      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          error: {
            code: 'INVALID_INPUT',
            message: 'Contenu XML requis',
          },
        },
        { status: 400 }
      )
    }

    // Get validator service
    const validator = getValidatorAI()

    if (!validator.isAvailable()) {
      return NextResponse.json(
        {
          success: false,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          error: {
            code: 'AI_UNAVAILABLE',
            message: 'Service de validation AI non disponible. Vérifiez GEMINI_API_KEY.',
          },
        },
        { status: 503 }
      )
    }

    // Create validation request
    const validateRequest: ValidateRequest = {
      tenantId: body.tenantId || 'default',
      userId: decoded.id,
      fileUrl: fileUrl || '',
      fileName: fileName || 'upload.xml',
      fileSize: fileSize || xmlContent.length,
      options,
    }

    // Execute validation
    const result = await validator.validate(
      validateRequest,
      xmlContent,
      rules || [],
      {
        useCache: options?.useCache ?? true,
        maxRetries: options?.maxRetries ?? 3,
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
 * GET /api/ai/validate - Check service status
 */
export async function GET(): Promise<NextResponse> {
  const validator = getValidatorAI()

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    service: 'Validator AI',
    available: validator.isAvailable(),
    version: '1.0.0',
  })
}
