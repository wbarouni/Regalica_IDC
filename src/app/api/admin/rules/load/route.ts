import { NextRequest, NextResponse } from 'next/server'
import { loadRDGRules, getRulesStatistics } from '../../../../../services/rdgRulesService'
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
        { success: false, error: 'Accès refusé - Administrateur requis' } as ApiResponse,
        { status: 403 }
      )
    }

    // Charger les règles
    const rules = await loadRDGRules()
    const stats = await getRulesStatistics()

    return NextResponse.json(
      {
        success: true,
        data: {
          rulesLoaded: rules.length,
          statistics: stats,
        },
        message: `${rules.length} règles RDG chargées avec succès`,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors du chargement des règles' } as ApiResponse,
      { status: 500 }
    )
  }
}
