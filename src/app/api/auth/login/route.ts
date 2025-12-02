import { NextRequest, NextResponse } from 'next/server'
import { authenticateUser } from '../../../../services/userService'
import { generateToken } from '../../../../lib/auth'
import { ApiResponse } from '../../../../types'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email et mot de passe requis' } as ApiResponse,
        { status: 400 }
      )
    }

    const user = await authenticateUser(email, password)

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Email ou mot de passe incorrect' } as ApiResponse,
        { status: 401 }
      )
    }

    const token = generateToken(user)

    return NextResponse.json(
      {
        success: true,
        data: {
          user,
          token,
        },
        message: 'Connexion réussie',
      } as ApiResponse,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la connexion' } as ApiResponse,
      { status: 500 }
    )
  }
}
