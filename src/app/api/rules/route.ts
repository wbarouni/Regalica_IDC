import { NextRequest, NextResponse } from 'next/server'
import { loadRDGRules, getRulesByAnnex, getRulesByDomain, searchRules } from '../../../services/rdgRulesService'
import { verifyToken, getTokenFromHeader } from '../../../lib/auth'
import { ApiResponse, PaginatedResponse } from '../../../types'

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

    const url = new URL(req.url)
    const page = parseInt(url.searchParams.get('page') || '1')
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10')
    const annexe = url.searchParams.get('annexe')
    const domaine = url.searchParams.get('domaine')
    const search = url.searchParams.get('search')
    const offset = (page - 1) * pageSize

    let rules = await loadRDGRules()

    // Filtrer par annexe
    if (annexe) {
      rules = await getRulesByAnnex(annexe)
    }

    // Filtrer par domaine
    if (domaine) {
      rules = await getRulesByDomain(domaine)
    }

    // Rechercher
    if (search) {
      rules = await searchRules(search)
    }

    const total = rules.length
    const paginatedRules = rules.slice(offset, offset + pageSize)

    return NextResponse.json(
      {
        success: true,
        data: paginatedRules,
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      } as PaginatedResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération des règles' } as ApiResponse,
      { status: 500 }
    )
  }
}
