/**
 * REGALICA AI - Validator Prompts
 * Templates de prompts pour le Validator AI
 */

import type { ValidationMetadata, RuleResult } from '../../../types/ai/validator.types'

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

export const VALIDATOR_SYSTEM_PROMPT = `Tu es un système expert de validation de reportings bancaires pour la Banque Centrale de Tunisie (BCT).

MISSION:
Valider les données XML de reporting bancaire contre les règles RDG (Règles de Gestion).

COMPÉTENCES:
- Maîtrise des 18 452 règles RDG de la BCT
- Expertise en calculs bancaires de haute précision
- Détection des écarts et anomalies
- Classification des erreurs par sévérité

PRINCIPES:
1. Précision absolue dans les calculs (3 décimales minimum)
2. Tolérance stricte: SEVERE si écart >= 0.01, ROUNDING si < 0.01
3. Traçabilité complète des termes utilisés
4. Aucune interpolation de données manquantes

OUTPUT FORMAT: JSON strict selon le schéma défini.`

// ============================================================================
// VALIDATION PROMPT
// ============================================================================

export interface ValidationPromptParams {
  metadata: ValidationMetadata
  xmlData: string
  rules: Array<{
    numRegle: number
    domaine: string
    annexe: string
    zoneTexte: string
    operator: string
    leftTerms: string
    rightTerms: string
  }>
}

export function buildValidationPrompt(params: ValidationPromptParams): string {
  const rulesJson = JSON.stringify(params.rules.slice(0, 50), null, 2)

  return `${VALIDATOR_SYSTEM_PROMPT}

# DONNÉES À VALIDER

## Métadonnées
- Code Banque: ${params.metadata.codeBanque}
- Date Annexe: ${params.metadata.dateAnnexe}
- Code Annexe: ${params.metadata.codeAnnexe}
- Nom Annexe: ${params.metadata.annexeName}

## Données XML (extrait)
\`\`\`xml
${params.xmlData.slice(0, 5000)}
\`\`\`

## Règles à Appliquer (${params.rules.length} règles)
\`\`\`json
${rulesJson}
\`\`\`

# INSTRUCTIONS

Pour chaque règle:
1. Extraire les valeurs des rubriques XML (termes calculée)
2. Extraire ou calculer les valeurs attendue
3. Appliquer l'opérateur de comparaison
4. Déterminer le statut: OK, ERROR, ou SKIPPED
5. Si ERROR: classifier comme SEVERE (écart >= 0.01) ou ROUNDING (< 0.01)

# FORMAT DE SORTIE

Réponds UNIQUEMENT avec un JSON valide:

\`\`\`json
{
  "results": [
    {
      "numRegle": 1,
      "ruleId": "RDG_484_001",
      "domaine": "...",
      "annexe": "...",
      "zoneTexte": "...",
      "operator": "=",
      "calculation": {
        "calculee": "1234567.890",
        "attendue": "1234567.890",
        "ecart": "0.000",
        "ecartAbsolu": "0.000",
        "ecartRelatif": "0.000"
      },
      "status": "OK",
      "severity": null,
      "terms": {
        "calculee": [
          {
            "rangTerm": 1,
            "numSeq": 1,
            "rubrique": "48401000000000",
            "colonne": "1",
            "operTermRegle": "+",
            "axOrigine": "A",
            "valeur": "1234567.890",
            "source": "XML"
          }
        ],
        "attendue": []
      }
    }
  ]
}
\`\`\`

COMMENCE LA VALIDATION MAINTENANT.`
}

// ============================================================================
// ERROR ANALYSIS PROMPT
// ============================================================================

export function buildErrorAnalysisPrompt(
  errors: RuleResult[],
  metadata: ValidationMetadata
): string {
  const errorsJson = JSON.stringify(errors, null, 2)

  return `${VALIDATOR_SYSTEM_PROMPT}

# ANALYSE DES ERREURS

## Contexte
- Annexe: ${metadata.codeAnnexe} - ${metadata.annexeName}
- Banque: ${metadata.codeBanque}
- Date: ${metadata.dateAnnexe}

## Erreurs Détectées (${errors.length})
\`\`\`json
${errorsJson}
\`\`\`

# INSTRUCTIONS

Analyse chaque erreur et fournis:
1. Cause probable de l'écart
2. Rubriques sources à vérifier
3. Action corrective recommandée
4. Impact sur les autres règles

# FORMAT DE SORTIE

\`\`\`json
{
  "analysis": [
    {
      "numRegle": 47,
      "causeProbable": "...",
      "rubriquesAVerifier": ["90101", "90102"],
      "actionCorrective": "...",
      "impactAutresRegles": [48, 49],
      "priorite": "HIGH"
    }
  ],
  "summary": "...",
  "recommendationGlobale": "..."
}
\`\`\`

COMMENCE L'ANALYSE.`
}

// ============================================================================
// SEVERITY CLASSIFICATION PROMPT
// ============================================================================

export function buildSeverityPrompt(
  ecart: number,
  ecartRelatif: number,
  context: string
): string {
  return `Classifie la sévérité de cet écart:

Écart Absolu: ${ecart}
Écart Relatif: ${ecartRelatif}%
Contexte: ${context}

Règles BCT:
- SEVERE: écart >= 0.01 ou écart relatif >= 0.01%
- ROUNDING: écart < 0.01 et écart relatif < 0.01%

Réponds avec: "SEVERE" ou "ROUNDING"`
}
