import { NextRequest, NextResponse } from 'next/server'
import { getUserById } from '@/services/userService'
import { verifyToken, getTokenFromHeader } from '@/lib/auth'
import { ApiResponse } from '@/types'

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

    const user = await getUserById(decoded.id)
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Utilisateur non trouvé' } as ApiResponse,
        { status: 404 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: user,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération de l\'utilisateur' } as ApiResponse,
      { status: 500 }
    )
  }
}
