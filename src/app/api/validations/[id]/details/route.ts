import { NextRequest, NextResponse } from 'next/server'
import { db } from '../../../../../db'
import { validations, ruleResults } from '../../../../../db/schema'
import { eq } from 'drizzle-orm'
import { verifyToken } from '../../../../../lib/auth'
import { geminiService } from '../../../../../services/geminiValidationService'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
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

    const validationId = params.id

    // Récupérer la validation
    const validation = await db
      .select()
      .from(validations)
      .where(eq(validations.id, validationId))
      .limit(1)

    if (!validation || validation.length === 0) {
      return NextResponse.json({ error: 'Validation non trouvée' }, { status: 404 })
    }

    // Vérifier les permissions
    if (validation[0].userId !== user.id && user.role !== 'admin') {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
    }

    // Récupérer les résultats des règles
    const results = await db
      .select()
      .from(ruleResults)
      .where(eq(ruleResults.validationId, validationId))

    // Analyser avec Gemini si demandé
    const includeAnalysis = req.nextUrl.searchParams.get('analysis') === 'true'

    let geminiAnalysis = null
    if (includeAnalysis && results.length > 0) {
      try {
        const failedRules = results.filter((r) => r.status === 'failed')
        const analysisData = {
          annexe: 'unknown',
          domaine: 'unknown',
          donnees: {
            totalRules: validation[0].totalRules,
            passedRules: validation[0].passedRules,
            failedRules: validation[0].failedRules,
            successRate: validation[0].successRate,
          },
          reglesApplicables: failedRules.slice(0, 10).map((r) => ({
            numRegle: parseInt(r.ruleId) || 0,
            description: r.ruleName || `Règle ${r.ruleId}`,
            operateur: 'equals',
            valeurAttendue: r.expectedValue,
            valeurCalculee: r.calculatedValue,
          })),
        }

        geminiAnalysis = await geminiService.analyzeValidation(analysisData)
      } catch (error) {
        console.error('Erreur analyse Gemini:', error)
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          validation: validation[0],
          results: results.map((r) => ({
            id: r.id,
            ruleNumber: parseInt(r.ruleId) || 0,
            status: r.status,
            expectedValue: r.expectedValue,
            calculatedValue: r.calculatedValue,
            tolerance: 0.01,
            message: r.message || '',
            details: r.details,
          })),
          geminiAnalysis,
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('Erreur:', error)
    return NextResponse.json(
      { error: error.message || 'Erreur serveur' },
      { status: 500 }
    )
  }
}
