import { RuleStatus } from '../types'
import { getActiveRules } from './rdgService'
import { addRuleResult, updateValidationStats } from './validationService'

export interface ValidationContext {
  validationId: string
  data: Record<string, unknown>
  metadata: Record<string, unknown>
}

export interface ValidationRuleResult {
  ruleId: string
  ruleName?: string
  ruleCategory?: string
  status: RuleStatus
  expectedValue?: string
  calculatedValue?: string
  tolerance?: number
  message?: string
  details?: Record<string, unknown>
}

/**
 * Exécuter la validation complète pour une validation
 */
export async function executeValidation(context: ValidationContext): Promise<ValidationRuleResult[]> {
  const results: ValidationRuleResult[] = []

  // Récupérer toutes les règles actives
  const rules = await getActiveRules()

  for (const rule of rules) {
    try {
      const result = await evaluateRule(rule, context)
      results.push(result)

      // Enregistrar el resultado en la base de datos
      await addRuleResult(context.validationId, {
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        ruleCategory: result.ruleCategory,
        status: result.status,
        expectedValue: result.expectedValue,
        calculatedValue: result.calculatedValue,
        tolerance: result.tolerance,
        message: result.message,
        details: result.details,
      })
    } catch (error: any) {
      console.error(`Erreur lors de l'évaluation de la règle ${rule.id}:`, error.message)

      // Enregistrer l'erreur comme résultat en attente
      await addRuleResult(context.validationId, {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleCategory: rule.category,
        status: 'pending',
        message: `Erreur lors de l'évaluation: ${error.message}`,
      })

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        ruleCategory: rule.category,
        status: 'pending',
        message: `Erreur lors de l'évaluation: ${error.message}`,
      })
    }
  }

  // Mettre à jour les statistiques de validation
  await updateValidationStats(context.validationId)

  return results
}

/**
 * Évaluer une règle individuelle
 */
async function evaluateRule(
  rule: any,
  context: ValidationContext
): Promise<ValidationRuleResult> {
  // Si la règle n'a pas de formule, retourner pending
  if (!rule.formula) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleCategory: rule.category,
      status: 'pending',
      message: 'Formule non définie',
    }
  }

  try {
    // Évaluer la formule
    const result = evaluateFormula(rule.formula, context.data)

    if (result === null) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        ruleCategory: rule.category,
        status: 'pending',
        message: 'Données manquantes pour évaluer la règle',
      }
    }

    // Déterminer le statut basé sur le résultat
    const status: RuleStatus = result.isValid ? 'passed' : 'failed'

    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleCategory: rule.category,
      status,
      expectedValue: result.expected?.toString(),
      calculatedValue: result.calculated?.toString(),
      tolerance: rule.tolerance,
      message: result.message,
      details: result.details,
    }
  } catch (error: any) {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      ruleCategory: rule.category,
      status: 'pending',
      message: `Erreur lors de l'évaluation: ${error.message}`,
    }
  }
}

/**
 * Évaluer une formule mathématique
 */
export function evaluateFormula(
  formula: string,
  data: Record<string, unknown>
): {
  isValid: boolean
  expected?: unknown
  calculated?: unknown
  message?: string
  details?: Record<string, unknown>
} | null {
  try {
    // Extraire les variables de la formule (format: {{VAR_NAME}})
    const varPattern = /\{\{([A-Z_]+)\}\}/g
    const matches = formula.matchAll(varPattern)
    const variables = new Set<string>()

    for (const match of matches) {
      variables.add(match[1])
    }

    // Vérifier que toutes les variables sont présentes dans les données
    for (const variable of variables) {
      if (!(variable in data)) {
        return null // Données manquantes
      }
    }

    // Remplacer les variables dans la formule
    let evaluableFormula = formula
    for (const variable of variables) {
      const value = data[variable]
      const numValue = typeof value === 'number' ? value : parseFloat(value as string)

      if (isNaN(numValue)) {
        return null // Valeur non numérique
      }

      evaluableFormula = evaluableFormula.replace(`{{${variable}}}`, numValue.toString())
    }

    // Évaluer la formule (utiliser une fonction sécurisée)
    const result = safeEval(evaluableFormula)

    return {
      isValid: Boolean(result),
      calculated: result,
      message: `Résultat: ${result}`,
      details: {
        formula,
        evaluatedFormula: evaluableFormula,
        variables: Array.from(variables),
      },
    }
  } catch (error: any) {
    throw new Error(`Erreur lors de l'évaluation de la formule: ${error.message}`)
  }
}

/**
 * Évaluer une expression mathématique de manière sécurisée
 */
function safeEval(expression: string): number {
  // Valider que l'expression ne contient que des caractères autorisés
  const allowedPattern = /^[\d+\-*/.()%\s]+$/
  if (!allowedPattern.test(expression)) {
    throw new Error('Expression contient des caractères non autorisés')
  }

  try {
    // Utiliser Function au lieu de eval pour plus de sécurité
    const result = new Function(`return ${expression}`)()
    return Number(result)
  } catch (error: any) {
    throw new Error(`Expression invalide: ${error.message}`)
  }
}

/**
 * Comparer deux valeurs avec tolérance
 */
export function compareWithTolerance(
  expected: number,
  calculated: number,
  tolerance: number = 0.01
): boolean {
  const diff = Math.abs(expected - calculated)
  const percentDiff = (diff / expected) * 100

  return percentDiff <= tolerance
}

/**
 * Générer un résumé de validation
 */
export function generateValidationSummary(results: ValidationRuleResult[]): {
  total: number
  passed: number
  failed: number
  pending: number
  warnings: number
  successRate: number
} {
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    pending: results.filter((r) => r.status === 'pending').length,
    warnings: results.filter((r) => r.status === 'warning').length,
    successRate: 0,
  }

  if (summary.total > 0) {
    summary.successRate = Math.round((summary.passed / summary.total) * 10000) / 100
  }

  return summary
}
