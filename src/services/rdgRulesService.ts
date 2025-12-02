/**
 * Service de gestion des règles RDG
 * Charge et gère les 18 452 règles de validation depuis le fichier JSON
 */

import { promises as fs } from 'fs'
import path from 'path'
import { RDG_CONFIG } from '../config/rdg.config'

export interface RDGRuleData {
  id?: string
  tenantId?: string
  ruleId?: string
  numRegle?: number
  domaine?: string
  annexe?: string
  operator?: string
  controlType?: string
  groupe?: string
  leftTerms?: string
  rightTerms?: string
  RANG_TERM?: number
  AX_TERM?: string
  RUBRIQUE?: string
  COLONNE?: string
  OPER_TERM_REGLE?: string
  NUM_SEQ?: number
  AX_ORIGINE?: string
  ZONE_TEXTE?: string
}

export interface ProcessedRDGRule {
  id: string
  numRegle: number
  domaine: string
  annexe?: string
  operator?: string
  controlType?: string
  groupe?: string
  leftTerms?: string
  rightTerms?: string
  rangTerm?: number
  axTerm?: string
  rubrique?: string
  colonne?: string
  operTermRegle?: string
  numSeq?: number
  axOrigine?: string
  zoneTexte?: string
  priority: number
  isActive: boolean
}

let cachedRules: ProcessedRDGRule[] | null = null

/**
 * Charger les règles RDG depuis le fichier JSON
 */
export async function loadRDGRules(): Promise<ProcessedRDGRule[]> {
  if (cachedRules) {
    return cachedRules
  }

  try {
    const rulesPath = path.join(process.cwd(), 'public', 'rdg_rules.json')
    const rulesData = await fs.readFile(rulesPath, 'utf-8')
    const rawRules: RDGRuleData[] = JSON.parse(rulesData)

    // Traiter et normaliser les règles
    cachedRules = rawRules
      .filter((rule) => rule.numRegle !== undefined && rule.numRegle !== null)
      .map((rule, index) => ({
        id: rule.ruleId || `RDG_${rule.numRegle}_${index}`,
        numRegle: rule.numRegle || 0,
        domaine: rule.domaine || '',
        annexe: rule.annexe,
        operator: rule.operator,
        controlType: rule.controlType,
        groupe: rule.groupe,
        leftTerms: rule.leftTerms,
        rightTerms: rule.rightTerms,
        rangTerm: rule.RANG_TERM,
        axTerm: rule.AX_TERM,
        rubrique: rule.RUBRIQUE,
        colonne: rule.COLONNE,
        operTermRegle: rule.OPER_TERM_REGLE,
        numSeq: rule.NUM_SEQ,
        axOrigine: rule.AX_ORIGINE,
        zoneTexte: rule.ZONE_TEXTE,
        priority: calculatePriority(rule),
        isActive: true,
      }))

    console.log(`✅ ${cachedRules.length} règles RDG chargées`)
    return cachedRules
  } catch (error: any) {
    console.error('Erreur lors du chargement des règles RDG:', error.message)
    throw new Error(`Impossible de charger les règles RDG: ${error.message}`)
  }
}

/**
 * Calculer la priorité d'une règle basée sur son type de contrôle
 */
function calculatePriority(rule: RDGRuleData): number {
  const controlType = rule.controlType?.toLowerCase() || ''

  if (controlType.includes('coherence')) return RDG_CONFIG.PRIORITY_LEVELS.HIGH
  if (controlType.includes('completude')) return RDG_CONFIG.PRIORITY_LEVELS.MEDIUM
  if (controlType.includes('conformite')) return RDG_CONFIG.PRIORITY_LEVELS.HIGH
  if (controlType.includes('calcul')) return RDG_CONFIG.PRIORITY_LEVELS.CRITICAL
  if (controlType.includes('logique')) return RDG_CONFIG.PRIORITY_LEVELS.MEDIUM

  return RDG_CONFIG.PRIORITY_LEVELS.LOW
}

/**
 * Obtenir les règles par annexe
 */
export async function getRulesByAnnex(annexNumber: string): Promise<ProcessedRDGRule[]> {
  const rules = await loadRDGRules()
  return rules.filter((rule) => rule.annexe === annexNumber)
}

/**
 * Obtenir les règles par domaine
 */
export async function getRulesByDomain(domain: string): Promise<ProcessedRDGRule[]> {
  const rules = await loadRDGRules()
  return rules.filter((rule) => rule.domaine === domain)
}

/**
 * Obtenir les règles par type de contrôle
 */
export async function getRulesByControlType(controlType: string): Promise<ProcessedRDGRule[]> {
  const rules = await loadRDGRules()
  return rules.filter((rule) => rule.controlType === controlType)
}

/**
 * Obtenir les règles par numéro de règle
 */
export async function getRulesByNumber(numRegle: number): Promise<ProcessedRDGRule[]> {
  const rules = await loadRDGRules()
  return rules.filter((rule) => rule.numRegle === numRegle)
}

/**
 * Obtenir les règles par priorité
 */
export async function getRulesByPriority(priority: number): Promise<ProcessedRDGRule[]> {
  const rules = await loadRDGRules()
  return rules.filter((rule) => rule.priority === priority)
}

/**
 * Obtenir les règles critiques
 */
export async function getCriticalRules(): Promise<ProcessedRDGRule[]> {
  const rules = await loadRDGRules()
  return rules.filter((rule) => rule.priority === RDG_CONFIG.PRIORITY_LEVELS.CRITICAL)
}

/**
 * Obtenir les statistiques des règles
 */
export async function getRulesStatistics(): Promise<{
  total: number
  byAnnex: Record<string, number>
  byDomain: Record<string, number>
  byControlType: Record<string, number>
  byPriority: Record<string, number>
}> {
  const rules = await loadRDGRules()

  const stats = {
    total: rules.length,
    byAnnex: {} as Record<string, number>,
    byDomain: {} as Record<string, number>,
    byControlType: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
  }

  for (const rule of rules) {
    // Par annexe
    if (rule.annexe) {
      stats.byAnnex[rule.annexe] = (stats.byAnnex[rule.annexe] || 0) + 1
    }

    // Par domaine
    if (rule.domaine) {
      stats.byDomain[rule.domaine] = (stats.byDomain[rule.domaine] || 0) + 1
    }

    // Par type de contrôle
    if (rule.controlType) {
      stats.byControlType[rule.controlType] = (stats.byControlType[rule.controlType] || 0) + 1
    }

    // Par priorité
    const priorityLabel = getPriorityLabel(rule.priority)
    stats.byPriority[priorityLabel] = (stats.byPriority[priorityLabel] || 0) + 1
  }

  return stats
}

/**
 * Obtenir le label d'une priorité
 */
function getPriorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    1: 'Critique',
    2: 'Élevée',
    3: 'Moyenne',
    4: 'Basse',
  }
  return labels[priority] || 'Inconnue'
}

/**
 * Rechercher les règles par texte
 */
export async function searchRules(query: string): Promise<ProcessedRDGRule[]> {
  const rules = await loadRDGRules()
  const lowerQuery = query.toLowerCase()

  return rules.filter(
    (rule) =>
      rule.id.toLowerCase().includes(lowerQuery) ||
      rule.domaine.toLowerCase().includes(lowerQuery) ||
      (rule.controlType && rule.controlType.toLowerCase().includes(lowerQuery)) ||
      (rule.groupe && rule.groupe.toLowerCase().includes(lowerQuery)) ||
      (rule.zoneTexte && rule.zoneTexte.toLowerCase().includes(lowerQuery))
  )
}

/**
 * Valider une règle contre des données
 */
export async function validateRuleAgainstData(
  rule: ProcessedRDGRule,
  data: Record<string, unknown>
): Promise<{
  passed: boolean
  message: string
  expectedValue?: unknown
  calculatedValue?: unknown
}> {
  try {
    // Si la règle n'a pas de termes, on ne peut pas la valider
    if (!rule.leftTerms && !rule.rightTerms) {
      return {
        passed: true,
        message: 'Règle sans conditions',
      }
    }

    // Extraire les valeurs des données
    const leftValue = rule.leftTerms ? extractValue(rule.leftTerms, data) : null
    const rightValue = rule.rightTerms ? extractValue(rule.rightTerms, data) : null

    // Si les données manquent, on retourne pending
    if (leftValue === null || rightValue === null) {
      return {
        passed: true,
        message: 'Données manquantes pour évaluer la règle',
      }
    }

    // Appliquer l'opérateur
    const operator = rule.operTermRegle || rule.operator || '='
    const passed = compareValues(leftValue, rightValue, operator, rule)

    return {
      passed,
      message: passed ? 'Validation réussie' : 'Validation échouée',
      expectedValue: rightValue,
      calculatedValue: leftValue,
    }
  } catch (error: any) {
    return {
      passed: false,
      message: `Erreur lors de la validation: ${error.message}`,
    }
  }
}

/**
 * Extraire une valeur des données
 */
function extractValue(term: string, data: Record<string, unknown>): unknown {
  // Supprimer les accolades si présentes
  const cleanTerm = term.replace(/[{}]/g, '').trim()

  // Chercher la valeur dans les données
  if (cleanTerm in data) {
    return data[cleanTerm]
  }

  // Essayer de trouver une clé correspondante (case-insensitive)
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase() === cleanTerm.toLowerCase()) {
      return value
    }
  }

  return null
}

/**
 * Comparer deux valeurs avec un opérateur
 */
function compareValues(
  left: unknown,
  right: unknown,
  operator: string,
  rule: ProcessedRDGRule
): boolean {
  try {
    const leftNum = Number(left)
    const rightNum = Number(right)

    // Si les deux sont des nombres
    if (!isNaN(leftNum) && !isNaN(rightNum)) {
      const tolerance = rule.rangTerm || RDG_CONFIG.DEFAULT_TOLERANCE

      switch (operator) {
        case '+':
        case '=':
          const diff = Math.abs(leftNum - rightNum)
          return diff <= tolerance
        case '-':
        case '!=':
          return leftNum !== rightNum
        case '>':
          return leftNum > rightNum
        case '<':
          return leftNum < rightNum
        case '>=':
          return leftNum >= rightNum
        case '<=':
          return leftNum <= rightNum
        default:
          return true
      }
    }

    // Comparaison de chaînes
    const leftStr = String(left).toLowerCase()
    const rightStr = String(right).toLowerCase()

    switch (operator) {
      case '=':
        return leftStr === rightStr
      case '!=':
        return leftStr !== rightStr
      case 'LIKE':
        return leftStr.includes(rightStr)
      case 'NOT LIKE':
        return !leftStr.includes(rightStr)
      default:
        return true
    }
  } catch (error) {
    return false
  }
}

/**
 * Vider le cache des règles
 */
export function clearRulesCache(): void {
  cachedRules = null
}
