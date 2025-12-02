import { NextRequest, NextResponse } from 'next/server'
import { getValidationsByUserId } from '@/services/validationService'
import { verifyToken, getTokenFromHeader } from '@/lib/auth'
import { ApiResponse, PaginatedResponse } from '@/types'

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
    const offset = (page - 1) * pageSize

    const validationsList = await getValidationsByUserId(decoded.id, pageSize, offset)

    return NextResponse.json(
      {
        success: true,
        data: validationsList,
        page,
        pageSize,
        total: validationsList.length,
        totalPages: Math.ceil(validationsList.length / pageSize),
      } as PaginatedResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération des validations' } as ApiResponse,
      { status: 500 }
    )
  }
}
