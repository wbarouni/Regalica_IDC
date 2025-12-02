import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, getTokenFromHeader } from '../lib/auth'

export function withAuth(handler: (req: NextRequest, context: any) => Promise<NextResponse>) {
  return async (req: NextRequest, context: any) => {
    const authHeader = req.headers.get('authorization')
    const token = getTokenFromHeader(authHeader)

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Token manquant' },
        { status: 401 }
      )
    }

    const decoded = verifyToken(token)
    if (!decoded) {
      return NextResponse.json(
        { success: false, error: 'Token invalide ou expiré' },
        { status: 401 }
      )
    }

    // Ajouter les informations d'utilisateur à la requête
    ;(req as any).user = decoded

    return handler(req, context)
  }
}

export function withRole(...allowedRoles: string[]) {
  return (handler: (req: NextRequest, context: any) => Promise<NextResponse>) => {
    return async (req: NextRequest, context: any) => {
      const authHeader = req.headers.get('authorization')
      const token = getTokenFromHeader(authHeader)

      if (!token) {
        return NextResponse.json(
          { success: false, error: 'Token manquant' },
          { status: 401 }
        )
      }

      const decoded = verifyToken(token)
      if (!decoded) {
        return NextResponse.json(
          { success: false, error: 'Token invalide ou expiré' },
          { status: 401 }
        )
      }

      if (!allowedRoles.includes(decoded.role)) {
        return NextResponse.json(
          { success: false, error: 'Accès refusé' },
          { status: 403 }
        )
      }

      ;(req as any).user = decoded

      return handler(req, context)
    }
  }
}
