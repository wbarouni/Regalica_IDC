import { NextRequest, NextResponse } from 'next/server'
import { getRulesStatistics } from '../../../../../services/rdgRulesService'
import { verifyToken, getTokenFromHeader } from '../../../../../lib/auth'
import { ApiResponse } from '../../../../../types'

export async function GET(req: NextRequest): Promise<NextResponse> {
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

    // Vérifier que l'utilisateur est admin ou analyst
    if (decoded.role !== 'admin' && decoded.role !== 'analyst') {
      return NextResponse.json(
        { success: false, error: 'Accès refusé' } as ApiResponse,
        { status: 403 }
      )
    }

    const stats = await getRulesStatistics()

    return NextResponse.json(
      {
        success: true,
        data: stats,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération des statistiques' } as ApiResponse,
      { status: 500 }
    )
  }
}
