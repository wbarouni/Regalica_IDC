import { NextRequest, NextResponse } from 'next/server'
import { getValidationById, getRuleResultsByValidationId } from '@/services/validationService'
import { verifyToken, getTokenFromHeader } from '@/lib/auth'
import { ApiResponse } from '@/types'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const authHeader = req.headers.get('authorization')
    const token = getTokenFromHeader(authHeader)

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token manquant' } as ApiResponse,
        { status: 401 }
      )
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json(
        { success: false, error: 'Token invalide ou expiré' } as ApiResponse,
        { status: 401 }
      )
    }

    const validation = await getValidationById(params.id)

    if (!validation) {
      return NextResponse.json(
        { success: false, error: 'Validation non trouvée' } as ApiResponse,
        { status: 404 }
      )
    }

    // Vérifier que l'utilisateur a accès à cette validation
    if (validation.userId !== decoded.id && decoded.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Accès refusé' } as ApiResponse,
        { status: 403 }
      )
    }

    const ruleResults = await getRuleResultsByValidationId(params.id)

    return NextResponse.json(
      {
        success: true,
        data: {
          validation,
          ruleResults,
        },
      } as ApiResponse,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération de la validation' } as ApiResponse,
      { status: 500 }
    )
  }
}
