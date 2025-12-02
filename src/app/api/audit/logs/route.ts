import { NextRequest, NextResponse } from 'next/server'
import { getAuditLogsByUserId } from '../../../../services/auditService'
import { verifyToken, getTokenFromHeader } from '../../../../lib/auth'
import { ApiResponse, PaginatedResponse } from '../../../../types'

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
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20')
    const offset = (page - 1) * pageSize

    // Les utilisateurs ne peuvent voir que leurs propres logs
    // Les admins peuvent voir tous les logs
    let logs

    if (decoded.role === 'admin') {
      // Pour les admins, récupérer tous les logs
      logs = await getAuditLogsByUserId(decoded.id, pageSize, offset)
    } else {
      // Pour les autres, récupérer seulement leurs logs
      logs = await getAuditLogsByUserId(decoded.id, pageSize, offset)
    }

    return NextResponse.json(
      {
        success: true,
        data: logs,
        page,
        pageSize,
        total: logs.length,
        totalPages: Math.ceil(logs.length / pageSize),
      } as PaginatedResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération des logs d\'audit' } as ApiResponse,
      { status: 500 }
    )
  }
}
