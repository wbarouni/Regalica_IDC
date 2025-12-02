import { NextResponse } from 'next/server'
import { db } from '../../../db'
import { sql } from 'drizzle-orm'

export async function GET(): Promise<NextResponse> {
  try {
    const startTime = Date.now()

    // Vérifier la connexion à la base de données
    await db.execute(sql`SELECT 1 as connected`)
    const dbTime = Date.now() - startTime

    // Vérifier les variables d'environnement
    const envCheck = {
      hasDatabase: !!process.env.DATABASE_URL,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      nodeEnv: process.env.NODE_ENV || 'development',
    }

    return NextResponse.json(
      {
        success: true,
        status: 'healthy',
        data: {
          timestamp: new Date(),
          uptime: process.uptime(),
          database: {
            connected: true,
            responseTime: `${dbTime}ms`,
          },
          environment: envCheck,
          version: '1.0.0',
          name: 'Regalica IDC',
          description: 'Plateforme de validation de reportings bancaires BCT',
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        status: 'unhealthy',
        error: error.message || 'Erreur de santé',
        data: {
          timestamp: new Date(),
          uptime: process.uptime(),
        },
      },
      { status: 503 }
    )
  }
}
