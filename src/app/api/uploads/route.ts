import { NextRequest, NextResponse } from 'next/server'
import { createUpload, getUploadsByUserId } from '../../../services/uploadService'
import { createValidation } from '../../../services/validationService'
import { verifyToken, getTokenFromHeader } from '../../../lib/auth'
import { ApiResponse, PaginatedResponse } from '../../../types'

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

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'Fichier manquant' } as ApiResponse,
        { status: 400 }
      )
    }

    const upload = await createUpload(
      decoded.id,
      file.name,
      file.size,
      'xml'
    )

    // Créer une validation associée
    const validation = await createValidation(upload.id, decoded.id)

    return NextResponse.json(
      {
        success: true,
        data: {
          upload,
          validation,
        },
        message: 'Fichier uploadé avec succès',
      } as ApiResponse,
      { status: 201 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de l\'upload' } as ApiResponse,
      { status: 500 }
    )
  }
}

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

    const uploadsList = await getUploadsByUserId(decoded.id, pageSize, offset)

    return NextResponse.json(
      {
        success: true,
        data: uploadsList,
        page,
        pageSize,
        total: uploadsList.length,
        totalPages: Math.ceil(uploadsList.length / pageSize),
      } as PaginatedResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération des uploads' } as ApiResponse,
      { status: 500 }
    )
  }
}
