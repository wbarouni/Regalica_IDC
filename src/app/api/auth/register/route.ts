import { NextRequest, NextResponse } from 'next/server'
import { createUser } from '@/services/userService'
import { generateToken } from '@/lib/auth'
import { validateEmail } from '@/lib/utils'
import { CreateUserInput, ApiResponse } from '@/types'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const { email, password, firstName, lastName, organization }: CreateUserInput = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email et mot de passe requis' } as ApiResponse,
        { status: 400 }
      )
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        { success: false, error: 'Email invalide' } as ApiResponse,
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: 'Le mot de passe doit contenir au moins 8 caractères' } as ApiResponse,
        { status: 400 }
      )
    }

    const user = await createUser({
      email,
      password,
      firstName,
      lastName,
      organization,
    })

    const token = generateToken(user)

    return NextResponse.json(
      {
        success: true,
        data: {
          user,
          token,
        },
        message: 'Utilisateur créé avec succès',
      } as ApiResponse,
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la création de l\'utilisateur' } as ApiResponse,
      { status: 500 }
    )
  }
}
