import { NextRequest, NextResponse } from 'next/server'
import { getValidationById, getRuleResultsByValidationId } from '../../../../../services/validationService'
import { verifyToken, getTokenFromHeader } from '../../../../../lib/auth'
import { ApiResponse, PaginatedResponse } from '../../../../../types'

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

    // Récupérer la validation
    const validation = await getValidationById(params.id)

    if (!validation) {
      return NextResponse.json(
        { success: false, error: 'Validation non trouvée' } as ApiResponse,
        { status: 404 }
      )
    }

    // Vérifier les permissions
    if (validation.userId !== decoded.id && decoded.role !== 'admin' && decoded.role !== 'analyst') {
      return NextResponse.json(
        { success: false, error: 'Accès refusé' } as ApiResponse,
        { status: 403 }
      )
    }

    // Récupérer les paramètres de pagination
    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10')
    const status = url.searchParams.get('status')
    const offset = (page - 1) * pageSize

    // Récupérer les résultats des règles
    let results = await getRuleResultsByValidationId(params.id)

    // Filtrer par statut si demandé
    if (status) {
      results = results.filter((r) => r.status === status)
    }

    // Paginer les résultats
    const total = results.length
    const paginatedResults = results.slice(offset, offset + pageSize)

    // Calculer les statistiques
    const stats = {
      total: results.length,
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      warning: results.filter((r) => r.status === 'warning').length,
      pending: results.filter((r) => r.status === 'pending').length,
      successRate: results.length > 0
        ? Math.round((results.filter((r) => r.status === 'passed').length / results.length) * 100)
        : 0,
    }

    return NextResponse.json(
      {
        success: true,
        data: paginatedResults,
        stats,
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      } as PaginatedResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération des résultats' } as ApiResponse,
      { status: 500 }
    )
  }
}
