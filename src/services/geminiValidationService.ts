import { GoogleGenerativeAI } from '@google/generative-ai'

interface ValidationData {
  annexe: string
  domaine: string
  donnees: Record<string, any>
  reglesApplicables: Array<{
    numRegle: number
    description: string
    operateur: string
    valeurAttendue: any
    valeurCalculee: any
  }>
}

interface GeminiAnalysis {
  anomalies: Array<{
    type: string
    severite: 'critique' | 'majeure' | 'mineure'
    description: string
    recommendation: string
  }>
  conformite: number
  riskScore: number
  recommendations: string[]
  summary: string
}

export class GeminiValidationService {
  private client: GoogleGenerativeAI
  private model: any

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY non configurée')
    }

    this.client = new GoogleGenerativeAI(apiKey)
    this.model = this.client.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
    })
  }

  /**
   * Analyser les données bancaires avec Gemini
   */
  async analyzeValidation(data: ValidationData): Promise<GeminiAnalysis> {
    try {
      const prompt = this.buildPrompt(data)

      const result = await this.model.generateContent(prompt)
      const responseText = result.response.text()

      // Parser la réponse JSON
      const analysis = this.parseResponse(responseText)

      return analysis
    } catch (error: any) {
      console.error('Erreur Gemini:', error)
      throw new Error(`Erreur lors de l'analyse Gemini: ${error.message}`)
    }
  }

  /**
   * Construire le prompt pour Gemini
   */
  private buildPrompt(data: ValidationData): string {
    const reglesText = data.reglesApplicables
      .map(
        (r) =>
          `- Règle ${r.numRegle}: ${r.description}
        Opérateur: ${r.operateur}
        Valeur attendue: ${JSON.stringify(r.valeurAttendue)}
        Valeur calculée: ${JSON.stringify(r.valeurCalculee)}`
      )
      .join('\n')

    return `Tu es un expert en validation de reportings bancaires pour la Banque Centrale de Tunisie (BCT).

Analyse les données suivantes et identifie les anomalies, incohérences et risques potentiels.

DONNÉES BANCAIRES:
Annexe: ${data.annexe}
Domaine: ${data.domaine}
Données: ${JSON.stringify(data.donnees, null, 2)}

RÈGLES APPLIQUÉES:
${reglesText}

ANALYSE REQUISE:
1. Identifier les anomalies (incohérences, données manquantes, valeurs aberrantes)
2. Évaluer la conformité globale (0-100%)
3. Calculer un score de risque (0-100)
4. Fournir des recommandations spécifiques
5. Résumer les findings principaux

Réponds en JSON avec cette structure:
{
  "anomalies": [
    {
      "type": "type d'anomalie",
      "severite": "critique|majeure|mineure",
      "description": "description détaillée",
      "recommendation": "action recommandée"
    }
  ],
  "conformite": <nombre 0-100>,
  "riskScore": <nombre 0-100>,
  "recommendations": ["recommendation 1", "recommendation 2"],
  "summary": "résumé des findings"
}`
  }

  /**
   * Parser la réponse de Gemini
   */
  private parseResponse(responseText: string): GeminiAnalysis {
    try {
      // Extraire le JSON de la réponse
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('Pas de JSON trouvé dans la réponse')
      }

      const parsed = JSON.parse(jsonMatch[0])

      return {
        anomalies: parsed.anomalies || [],
        conformite: Math.min(100, Math.max(0, parsed.conformite || 0)),
        riskScore: Math.min(100, Math.max(0, parsed.riskScore || 0)),
        recommendations: parsed.recommendations || [],
        summary: parsed.summary || '',
      }
    } catch (error: any) {
      console.error('Erreur parsing:', error)
      return {
        anomalies: [],
        conformite: 0,
        riskScore: 100,
        recommendations: ['Erreur lors de l\'analyse. Veuillez réessayer.'],
        summary: 'Analyse échouée',
      }
    }
  }

  /**
   * Détecter les anomalies dans les données
   */
  async detectAnomalies(data: Record<string, any>): Promise<string[]> {
    try {
      const prompt = `Analyse ces données bancaires et identifie les anomalies potentielles:
${JSON.stringify(data, null, 2)}

Réponds avec une liste JSON d'anomalies détectées.`

      const result = await this.model.generateContent(prompt)
      const responseText = result.response.text()

      const anomalies = this.parseAnomalies(responseText)
      return anomalies
    } catch (error: any) {
      console.error('Erreur détection anomalies:', error)
      return []
    }
  }

  /**
   * Parser les anomalies détectées
   */
  private parseAnomalies(responseText: string): string[] {
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        return []
      }

      const anomalies = JSON.parse(jsonMatch[0])
      return Array.isArray(anomalies) ? anomalies : []
    } catch {
      return []
    }
  }

  /**
   * Générer des recommandations
   */
  async generateRecommendations(
    validationResults: any[],
    failedRules: number
  ): Promise<string[]> {
    try {
      const prompt = `Basé sur ces résultats de validation:
- Nombre de règles échouées: ${failedRules}
- Résultats: ${JSON.stringify(validationResults, null, 2)}

Génère des recommandations spécifiques pour améliorer la conformité.
Réponds avec une liste JSON de recommandations.`

      const result = await this.model.generateContent(prompt)
      const responseText = result.response.text()

      const recommendations = this.parseAnomalies(responseText)
      return recommendations
    } catch (error: any) {
      console.error('Erreur recommandations:', error)
      return []
    }
  }

  /**
   * Évaluer le risque global
   */
  async assessRisk(
    conformityRate: number,
    failedRules: number,
    totalRules: number
  ): Promise<{
    riskLevel: 'faible' | 'modéré' | 'élevé' | 'critique'
    riskScore: number
    factors: string[]
  }> {
    try {
      const failureRate = (failedRules / totalRules) * 100

      // Calcul du score de risque
      let riskScore = 0
      const factors: string[] = []

      if (conformityRate < 50) {
        riskScore += 40
        factors.push('Conformité très faible')
      } else if (conformityRate < 75) {
        riskScore += 25
        factors.push('Conformité insuffisante')
      } else if (conformityRate < 90) {
        riskScore += 10
        factors.push('Conformité acceptable mais perfectible')
      }

      if (failureRate > 30) {
        riskScore += 30
        factors.push('Taux d\'échec élevé des règles')
      } else if (failureRate > 15) {
        riskScore += 15
        factors.push('Taux d\'échec modéré')
      }

      // Demander à Gemini une évaluation supplémentaire
      const prompt = `Évalue le risque global pour ces métriques:
- Taux de conformité: ${conformityRate}%
- Taux d'échec des règles: ${failureRate}%
- Nombre total de règles: ${totalRules}

Réponds avec un JSON contenant:
{
  "riskLevel": "faible|modéré|élevé|critique",
  "additionalFactors": ["facteur 1", "facteur 2"]
}`

      const result = await this.model.generateContent(prompt)
      const responseText = result.response.text()

      const parsed = this.parseResponse(responseText)
      if (parsed.anomalies.length > 0) {
        factors.push(
          ...parsed.anomalies.map((a) => `${a.type}: ${a.description}`)
        )
      }

      // Déterminer le niveau de risque
      let riskLevel: 'faible' | 'modéré' | 'élevé' | 'critique'
      if (riskScore < 25) {
        riskLevel = 'faible'
      } else if (riskScore < 50) {
        riskLevel = 'modéré'
      } else if (riskScore < 75) {
        riskLevel = 'élevé'
      } else {
        riskLevel = 'critique'
      }

      return {
        riskLevel,
        riskScore: Math.min(100, riskScore),
        factors,
      }
    } catch (error: any) {
      console.error('Erreur évaluation risque:', error)
      return {
        riskLevel: 'critique',
        riskScore: 100,
        factors: ['Erreur lors de l\'évaluation du risque'],
      }
    }
  }
}

// Export singleton
export const geminiService = new GeminiValidationService()
