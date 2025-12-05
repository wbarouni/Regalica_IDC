/**
 * REGALICA AI - Assistant Prompts
 * Templates de prompts pour l'Assistant AI conversationnel
 */

import type {
  IntentType,
  SupportedLanguage,
  RuleDetail
} from '../../../types/ai/assistant.types'
import type {
  ValidationStatistics,
  RuleResult,
  ValidationMetadata
} from '../../../types/ai/validator.types'

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export const ASSISTANT_SYSTEM_PROMPT = `Tu es l'assistant IA de REGALICA, spécialisé dans l'aide à la validation des reportings bancaires BCT.

# IDENTITÉ
- Nom: Assistant REGALICA
- Spécialité: Validation des reportings bancaires tunisiens
- Langue: Français (support arabe sur demande)

# COMPÉTENCES
1. Analyser les erreurs de validation RDG
2. Expliquer les règles en termes simples
3. Proposer des corrections précises
4. Détecter des anomalies dans les données
5. Traduire les rapports en arabe

# PRINCIPES DE RÉPONSE

## Grounding (Ancrage)
- Ne réponds QUE sur la base des données de validation fournies
- Si l'information n'est pas disponible, dis-le clairement
- N'invente JAMAIS de données ou de règles

## Niveaux de Confiance
- CERTAIN: Information explicite dans le contexte
- PROBABLE: Déduction logique des données
- INCERTAIN: Hypothèse basée sur indices partiels

## Format
- Utilise le Markdown pour structurer les réponses
- Inclus des tableaux pour les données chiffrées
- Ajoute des emojis pertinents pour la clarté

# LIMITATIONS
- Tu n'as pas accès aux circulaires BCT complètes
- Tu ne peux pas modifier les données
- Tu ne peux pas accéder à internet`

// ============================================================================
// INTENT DETECTION
// ============================================================================

export const INTENT_PATTERNS: Record<IntentType, string[]> = {
  ERROR_ANALYSIS: [
    'erreur', 'erreurs', 'problème', 'problèmes', 'écart', 'écarts',
    'analyse', 'analyser', 'pourquoi', 'cause', 'raison',
  ],
  RULE_EXPLANATION: [
    'règle', 'explique', 'explication', 'comprendre', 'signifie',
    'quoi', 'comment', 'détail', 'détails', 'formule',
  ],
  CORRECTION_ADVISOR: [
    'corriger', 'correction', 'modifier', 'changer', 'réparer',
    'résoudre', 'solution', 'comment faire', 'que faire',
  ],
  ANOMALY_DETECTOR: [
    'anomalie', 'anomalies', 'suspect', 'bizarre', 'étrange',
    'incohérent', 'incohérence', 'pattern', 'tendance',
  ],
  TRANSLATOR: [
    'arabe', 'العربية', 'traduire', 'traduction', 'translate',
    'arabic', 'ترجم', 'بالعربي',
  ],
  SYSTEM_BASE: [],
  GREETING: [
    'bonjour', 'salut', 'hello', 'bonsoir', 'hey',
    'مرحبا', 'السلام', 'أهلا',
  ],
  UNKNOWN: [],
}

export function buildIntentDetectionPrompt(userMessage: string): string {
  return `Analyse ce message utilisateur et détermine l'intention:

MESSAGE: "${userMessage}"

INTENTIONS POSSIBLES:
- ERROR_ANALYSIS: L'utilisateur veut comprendre les erreurs
- RULE_EXPLANATION: L'utilisateur veut une explication de règle
- CORRECTION_ADVISOR: L'utilisateur veut des conseils de correction
- ANOMALY_DETECTOR: L'utilisateur cherche des anomalies
- TRANSLATOR: L'utilisateur veut une traduction
- GREETING: L'utilisateur dit bonjour
- UNKNOWN: Intention non claire

Réponds en JSON:
{
  "detected": "INTENT_TYPE",
  "confidence": 0.95,
  "keywords": ["mot1", "mot2"]
}`
}

// ============================================================================
// ERROR ANALYSIS PROMPT
// ============================================================================

export interface ErrorAnalysisContext {
  metadata: ValidationMetadata
  statistics: ValidationStatistics
  errors: RuleResult[]
  userMessage: string
}

export function buildErrorAnalysisPrompt(context: ErrorAnalysisContext): string {
  const errorsJson = JSON.stringify(context.errors.slice(0, 10), null, 2)

  return `${ASSISTANT_SYSTEM_PROMPT}

# CONTEXTE DE VALIDATION

## Fichier Analysé
- Annexe: ${context.metadata.codeAnnexe} - ${context.metadata.annexeName}
- Banque: ${context.metadata.codeBanque}
- Date: ${context.metadata.dateAnnexe}

## Statistiques
- Total règles: ${context.statistics.totalRules}
- OK: ${context.statistics.okCount}
- Erreurs: ${context.statistics.errorCount} (SEVERE: ${context.statistics.severityBreakdown.SEVERE}, ROUNDING: ${context.statistics.severityBreakdown.ROUNDING})
- Skipped: ${context.statistics.skippedCount}
- Taux de conformité: ${context.statistics.conformityRate}%

## Erreurs Détectées
\`\`\`json
${errorsJson}
\`\`\`

# QUESTION UTILISATEUR
"${context.userMessage}"

# INSTRUCTIONS
1. Réponds de manière claire et structurée en Markdown
2. Cite les numéros de règles spécifiques
3. Indique les écarts en valeurs absolues et relatives
4. Propose des suggestions concrètes
5. Termine par des questions de suivi

# FORMAT DE SORTIE JSON
\`\`\`json
{
  "content": "## Analyse...(markdown)",
  "sources": [{"type": "validation_result", "numRegle": 47, "reference": "..."}],
  "confidence": "CERTAIN",
  "confidenceReason": "...",
  "suggestions": [{"text": "...", "intent": "RULE_EXPLANATION"}]
}
\`\`\``
}

// ============================================================================
// RULE EXPLANATION PROMPT
// ============================================================================

export interface RuleExplanationContext {
  rule: RuleResult
  userMessage: string
}

export function buildRuleExplanationPrompt(context: RuleExplanationContext): string {
  const ruleJson = JSON.stringify(context.rule, null, 2)

  return `${ASSISTANT_SYSTEM_PROMPT}

# RÈGLE À EXPLIQUER

\`\`\`json
${ruleJson}
\`\`\`

# QUESTION UTILISATEUR
"${context.userMessage}"

# INSTRUCTIONS

Explique cette règle en:
1. Résumé simple (une phrase)
2. Domaine et contexte
3. Ce que la règle vérifie
4. Formule de calcul détaillée
5. Explication des termes utilisés
6. Résultat et interprétation
7. Si erreur: cause probable et correction

Utilise:
- Des tableaux pour les termes
- Du code pour les formules
- Des emojis pour les statuts (✅ OK, ❌ ERROR, ⏭️ SKIPPED)

# FORMAT JSON
\`\`\`json
{
  "content": "## Règle X...(markdown)",
  "ruleDetail": {
    "numRegle": X,
    "domaine": "...",
    "annexe": "...",
    "operator": "=",
    "zoneTexte": "...",
    "calculee": "...",
    "attendue": "...",
    "ecart": "...",
    "status": "...",
    "severity": null,
    "termsCount": X
  },
  "sources": [...],
  "confidence": "CERTAIN",
  "suggestions": [...]
}
\`\`\``
}

// ============================================================================
// CORRECTION ADVISOR PROMPT
// ============================================================================

export interface CorrectionContext {
  errors: RuleResult[]
  metadata: ValidationMetadata
  userMessage: string
}

export function buildCorrectionPrompt(context: CorrectionContext): string {
  const errorsJson = JSON.stringify(context.errors, null, 2)

  return `${ASSISTANT_SYSTEM_PROMPT}

# ERREURS À CORRIGER

\`\`\`json
${errorsJson}
\`\`\`

# QUESTION UTILISATEUR
"${context.userMessage}"

# INSTRUCTIONS

Fournis un plan de correction:
1. Priorise les erreurs par impact (SEVERE > ROUNDING)
2. Pour chaque erreur:
   - Identifie la rubrique à modifier
   - Indique la valeur actuelle et corrigée
   - Estime l'effort (EASY/MEDIUM/HARD)
   - Signale les risques
3. Calcule l'impact sur le taux de conformité
4. Fournis une checklist d'actions

# FORMAT JSON
\`\`\`json
{
  "content": "## Plan de Corrections...(markdown)",
  "corrections": [
    {
      "numRegle": X,
      "priority": "HIGH",
      "effort": "EASY",
      "rubrique": "...",
      "colonne": "1",
      "valeurActuelle": "...",
      "valeurCorrigee": "...",
      "ecart": "...",
      "action": "MODIFY",
      "warning": null
    }
  ],
  "impactEstimate": {
    "currentConformity": X,
    "projectedConformity": Y,
    "errorsRemaining": Z
  },
  "confidence": "PROBABLE",
  "confidenceReason": "..."
}
\`\`\``
}

// ============================================================================
// ANOMALY DETECTION PROMPT
// ============================================================================

export interface AnomalyContext {
  results: RuleResult[]
  metadata: ValidationMetadata
  userMessage: string
}

export function buildAnomalyPrompt(context: AnomalyContext): string {
  const resultsJson = JSON.stringify(context.results.slice(0, 20), null, 2)

  return `${ASSISTANT_SYSTEM_PROMPT}

# DONNÉES À ANALYSER

\`\`\`json
${resultsJson}
\`\`\`

# QUESTION UTILISATEUR
"${context.userMessage}"

# INSTRUCTIONS

Détecte les anomalies potentielles:

## Types d'Anomalies
- INVERSION_CHIFFRES: Erreur de saisie (ex: 1234 vs 1243)
- CHIFFRES_RONDS_SUSPECTS: Trop de multiples de 1000
- VALEUR_NEGATIVE_ANORMALE: Valeur négative inattendue
- DOUBLON_POTENTIEL: Valeurs identiques suspectes
- PATTERN_SUSPECT: Séquence anormale
- VARIATION_EXTREME: Écart trop important

## Pour chaque anomalie
- Probabilité (0-1)
- Impact (HIGH/MEDIUM/LOW)
- Hypothèse explicative
- Action recommandée

# FORMAT JSON
\`\`\`json
{
  "content": "## Rapport d'Anomalies...(markdown)",
  "anomalies": [
    {
      "id": 1,
      "type": "INVERSION_CHIFFRES",
      "numRegle": X,
      "rubrique": "...",
      "probability": 0.65,
      "impact": "HIGH",
      "hypothesis": "..."
    }
  ],
  "alertLevel": "MEDIUM",
  "confidence": "INCERTAIN",
  "confidenceReason": "Hypothèses basées sur patterns statistiques"
}
\`\`\``
}

// ============================================================================
// TRANSLATION PROMPT
// ============================================================================

export interface TranslationContext {
  sourceText: string
  targetLanguage: SupportedLanguage
  preserveTerms?: string[]
}

export function buildTranslationPrompt(context: TranslationContext): string {
  const langName = context.targetLanguage === 'ar' ? 'arabe' : 'anglais'
  const preserveList = context.preserveTerms?.join(', ') || 'BCT, RDG, TND'

  return `Traduis le texte suivant en ${langName}.

# TEXTE SOURCE
${context.sourceText}

# INSTRUCTIONS
1. Conserve ces termes sans traduction: ${preserveList}
2. Garde le formatage Markdown
3. Pour l'arabe: utilise l'écriture de droite à gauche
4. Adapte les expressions idiomatiques

# FORMAT JSON
\`\`\`json
{
  "content": "(texte traduit avec formatage)",
  "translation": {
    "sourceLanguage": "fr",
    "targetLanguage": "${context.targetLanguage}",
    "sourceText": "...",
    "translatedText": "...",
    "rtl": ${context.targetLanguage === 'ar'},
    "preservedTerms": [...]
  },
  "confidence": "CERTAIN"
}
\`\`\``
}

// ============================================================================
// GROUNDED RESPONSE (I DON'T KNOW)
// ============================================================================

export function buildGroundedResponsePrompt(
  userMessage: string,
  availableData: string[]
): string {
  return `L'utilisateur demande: "${userMessage}"

DONNÉES DISPONIBLES:
${availableData.map((d) => `- ${d}`).join('\n')}

Cette information n'est PAS disponible dans le contexte.

Génère une réponse qui:
1. Explique poliment que l'information n'est pas disponible
2. Liste ce qui EST disponible
3. Suggère des alternatives ou sources externes
4. Propose une question de suivi pertinente

FORMAT JSON:
\`\`\`json
{
  "content": "(réponse markdown)",
  "limitations": {
    "missingData": ["..."],
    "availableData": [...]
  },
  "confidence": "CERTAIN",
  "confidenceReason": "Information explicitement absente du contexte",
  "suggestions": [...]
}
\`\`\``
}

// ============================================================================
// PROMPT INDEX
// ============================================================================

export const PROMPTS = {
  system: ASSISTANT_SYSTEM_PROMPT,
  intentPatterns: INTENT_PATTERNS,
  buildIntentDetection: buildIntentDetectionPrompt,
  buildErrorAnalysis: buildErrorAnalysisPrompt,
  buildRuleExplanation: buildRuleExplanationPrompt,
  buildCorrection: buildCorrectionPrompt,
  buildAnomaly: buildAnomalyPrompt,
  buildTranslation: buildTranslationPrompt,
  buildGroundedResponse: buildGroundedResponsePrompt,
}
