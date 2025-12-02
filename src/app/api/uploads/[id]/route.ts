import { NextRequest, NextResponse } from 'next/server'
import { getUploadById, deleteUpload } from '../../../../services/uploadService'
import { verifyToken, getTokenFromHeader } from '../../../../lib/auth'
import { ApiResponse } from '../../../../types'

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

    const upload = await getUploadById(params.id)

    if (!upload) {
      return NextResponse.json(
        { success: false, error: 'Upload non trouvé' } as ApiResponse,
        { status: 404 }
      )
    }

    // Vérifier que l'utilisateur est propriétaire de l'upload
    if (upload.userId !== decoded.id && decoded.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Accès refusé' } as ApiResponse,
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: upload,
      } as ApiResponse,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la récupération de l\'upload' } as ApiResponse,
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    const upload = await getUploadById(params.id)

    if (!upload) {
      return NextResponse.json(
        { success: false, error: 'Upload non trouvé' } as ApiResponse,
        { status: 404 }
      )
    }

    // Vérifier que l'utilisateur est propriétaire de l'upload ou admin
    if (upload.userId !== decoded.id && decoded.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Accès refusé' } as ApiResponse,
        { status: 403 }
      )
    }

    const success = await deleteUpload(params.id)

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'Erreur lors de la suppression de l\'upload' } as ApiResponse,
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Upload supprimé avec succès',
      } as ApiResponse,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Erreur lors de la suppression de l\'upload' } as ApiResponse,
      { status: 500 }
    )
  }
}
