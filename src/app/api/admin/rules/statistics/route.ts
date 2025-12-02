import { NextRequest, NextResponse } from 'next/server'
import { getRulesStatistics, getRulesGroupedByCategory } from '../../../../../services/rdgRulesLoaderService'
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

    // Vérifier que l'utilisateur est admin
    if (decoded.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Accès refusé - Seuls les administrateurs peuvent voir les statistiques' } as ApiResponse,
        { status: 403 }
      )
    }

    const stats = await getRulesStatistics()
    const grouped = await getRulesGroupedByCategory()

    return NextResponse.json(
      {
        success: true,
        data: {
          statistics: stats,
          categoriesCount: Object.keys(grouped).length,
          categories: Object.keys(grouped).map((cat) => ({
            name: cat,
            count: grouped[cat].length,
            active: grouped[cat].filter((r) => r.isActive).length,
          })),
        },
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
