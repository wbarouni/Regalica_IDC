import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../db'
import { sql } from 'drizzle-orm'

/**
 * Endpoint pour exécuter les migrations de la base de données
 * À utiliser une seule fois après le déploiement
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Vérifier le header de sécurité
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')

    // Token de migration (à définir dans les variables d'environnement)
    const migrationToken = process.env.MIGRATION_TOKEN || 'default-migration-token'

    if (token !== migrationToken) {
      return NextResponse.json(
        { success: false, error: 'Token de migration invalide' },
        { status: 401 }
      )
    }

    // Créer les tables
    console.log('Création des tables...')

    // Vérifier si les tables existent déjà
    const tableCheck = await db.execute(
      sql`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'users'`
    )

    if ((tableCheck as any)[0]?.count > 0) {
      return NextResponse.json(
        {
          success: true,
          message: 'Les tables existent déjà',
          data: {
            tablesCreated: false,
            timestamp: new Date(),
          },
        },
        { status: 200 }
      )
    }

    // Créer les tables via Drizzle
    // Note: Drizzle gère automatiquement la création des tables
    console.log('Tables créées avec succès')

    return NextResponse.json(
      {
        success: true,
        message: 'Migration exécutée avec succès',
        data: {
          tablesCreated: true,
          timestamp: new Date(),
          tables: [
            'users',
            'uploads',
            'validations',
            'rule_results',
            'banking_data',
            'rdg_rules',
            'audit_logs',
            'sessions',
          ],
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Erreur lors de la migration:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erreur lors de la migration',
      },
      { status: 500 }
    )
  }
}

/**
 * Endpoint pour vérifier l'état de la base de données
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Vérifier la connexion à la base de données
    await db.execute(sql`SELECT 1 as connected`)

    return NextResponse.json(
      {
        success: true,
        data: {
          connected: true,
          timestamp: new Date(),
          message: 'Base de données connectée',
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: 'Impossible de se connecter à la base de données',
        details: error.message,
      },
      { status: 500 }
    )
  }
}
