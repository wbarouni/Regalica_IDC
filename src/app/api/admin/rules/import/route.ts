import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../db'
import { rdgRules } from '../../../../../db/schema'
import { verifyToken } from '../../../../../lib/auth'
import fs from 'fs'
import path from 'path'

interface RDGRule {
  numRegle: number
  annexe: string
  domaine: string
  typeControle: string
  description: string
  operateur: string
  valeurAttendue: any
  tolerance: number
  priorite: number
  actif: boolean
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Vérifier l'authentification
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const user = await verifyToken(token)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Accès refusé - Admin requis' }, { status: 403 })
    }

    // Charger le fichier JSON des règles
    const rulesPath = path.join(process.cwd(), 'public', 'rdg_rules.json')

    if (!fs.existsSync(rulesPath)) {
      return NextResponse.json(
        { error: 'Fichier des règles RDG non trouvé' },
        { status: 404 }
      )
    }

    const rulesData = fs.readFileSync(rulesPath, 'utf-8')
    const rules: RDGRule[] = JSON.parse(rulesData)

    if (!Array.isArray(rules) || rules.length === 0) {
      return NextResponse.json(
        { error: 'Format de fichier invalide' },
        { status: 400 }
      )
    }

    // Vérifier si les règles existent déjà
    const existingRules = await db.select().from(rdgRules).limit(1)

    if (existingRules.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Les règles RDG sont déjà chargées',
          data: {
            totalRules: rules.length,
            alreadyLoaded: true,
          },
        },
        { status: 200 }
      )
    }

    // Insérer les règles par batch
    const batchSize = 100
    let inserted = 0

    for (let i = 0; i < rules.length; i += batchSize) {
      const batch = rules.slice(i, i + batchSize)

      const rulesToInsert = batch.map((rule) => ({
        id: `rule-${rule.numRegle}`,
        numRegle: rule.numRegle,
        annexe: rule.annexe,
        domaine: rule.domaine,
        typeControle: rule.typeControle,
        description: rule.description,
        operateur: rule.operateur,
        valeurAttendue: JSON.stringify(rule.valeurAttendue),
        tolerance: String(rule.tolerance || 0.01),
        priority: rule.priorite || 1,
        isActive: rule.actif !== false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))

      await db.insert(rdgRules).values(rulesToInsert)
      inserted += batch.length
    }

    return NextResponse.json(
      {
        success: true,
        message: `${inserted} règles RDG importées avec succès`,
        data: {
          totalRules: rules.length,
          importedRules: inserted,
          timestamp: new Date(),
        },
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('Erreur import règles:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erreur lors de l\'import des règles',
      },
      { status: 500 }
    )
  }
}

/**
 * Endpoint GET pour vérifier l'état du chargement des règles
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // Vérifier l'authentification
    const token = req.headers.get('authorization')?.replace('Bearer ', '')
    if (!token) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    }

    const user = await verifyToken(token)
    if (!user) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 })
    }

    // Compter les règles chargées
    const rulesCount = await db.select().from(rdgRules)

    return NextResponse.json(
      {
        success: true,
        data: {
          rulesLoaded: rulesCount.length > 0,
          totalRules: rulesCount.length,
          timestamp: new Date(),
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Erreur vérification règles:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Erreur lors de la vérification',
      },
      { status: 500 }
    )
  }
}
