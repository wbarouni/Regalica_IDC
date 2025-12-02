import { NextRequest, NextResponse } from 'next/server'
import { loadRDGRulesFromJSON, getRulesStatistics } from '../../../../../services/rdgRulesLoaderService'
import { verifyToken, getTokenFromHeader } from '../../../../../lib/auth'
import { ApiResponse } from '../../../../../types'

export async function POST(req: NextRequest): Promise<NextResponse> {
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
        { success: false, error: 'Accès refusé - Seuls les administrateurs peuvent charger les règles' } as ApiResponse,
        { status: 403 }
      )
    }

    const body = await req.json()
    const { rules } = body

    if (!Array.isArray(rules)) {
      return NextResponse.json(
        { success: false, error: 'Les règles doivent être un tableau' } as ApiResponse,
        { status: 400 }
      )
    }

    // Charger les règles
    const loadedCount = await loadRDGRulesFromJSON(rules)

    // Obtenir les statistiques
    const stats = await getRulesStatistics()

    return NextResponse.json(
      {
        success: true,
        data: {
          loadedCount,
          statistics: stats,
        },
        message: `${loadedCount} règles chargées avec succès`,
      } as ApiResponse,
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors du chargement des règles' } as ApiResponse,
      { status: 500 }
    )
  }
}
