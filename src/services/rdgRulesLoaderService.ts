import { db } from '../db'
import { rdgRules } from '../db/schema'
import { eq } from 'drizzle-orm'
import { RDGRule } from '../types'

export interface RDGRuleInput {
  id: string
  name: string
  description?: string
  category: string
  annexNumber?: string
  formula?: string
  tolerance?: number
  isActive?: boolean
  priority?: number
}

/**
 * Charger les règles RDG depuis un fichier JSON
 * Le fichier doit contenir un array de règles
 */
export async function loadRDGRulesFromJSON(rulesData: RDGRuleInput[]): Promise<number> {
  let loadedCount = 0

  for (const rule of rulesData) {
    try {
      // Vérifier si la règle existe déjà
      const existing = await db.query.rdgRules.findFirst({
        where: eq(rdgRules.id, rule.id),
      })

      if (!existing) {
        await db.insert(rdgRules).values({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          category: rule.category,
          annexNumber: rule.annexNumber,
          formula: rule.formula,
          tolerance: (rule.tolerance || 0.01).toString(),
          isActive: rule.isActive !== false,
          priority: rule.priority || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        loadedCount++
      }
    } catch (error: any) {
      console.error(`Erreur lors du chargement de la règle ${rule.id}:`, error.message)
    }
  }

  return loadedCount
}

/**
 * Obtenir toutes les règles groupées par catégorie
 */
export async function getRulesGroupedByCategory(): Promise<Record<string, RDGRule[]>> {
  const rules = await db.query.rdgRules.findMany()

  const grouped: Record<string, RDGRule[]> = {}

  for (const rule of rules) {
    const category = rule.category || 'Autres'

    if (!grouped[category]) {
      grouped[category] = []
    }

    grouped[category].push({
      id: rule.id,
      name: rule.name || undefined,
      description: rule.description || undefined,
      category: rule.category || undefined,
      annexNumber: rule.annexNumber || undefined,
      formula: rule.formula || undefined,
      tolerance: rule.tolerance ? Number(rule.tolerance) : undefined,
      isActive: rule.isActive || true,
      priority: rule.priority || 0,
      createdAt: rule.createdAt || new Date(),
      updatedAt: rule.updatedAt || new Date(),
    })
  }

  return grouped
}

/**
 * Obtenir les statistiques des règles
 */
export async function getRulesStatistics(): Promise<{
  total: number
  active: number
  byCategory: Record<string, number>
}> {
  const rules = await db.query.rdgRules.findMany()

  const stats = {
    total: rules.length,
    active: rules.filter((r) => r.isActive).length,
    byCategory: {} as Record<string, number>,
  }

  for (const rule of rules) {
    const category = rule.category || 'Autres'
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1
  }

  return stats
}

/**
 * Supprimer toutes les règles (pour réinitialiser)
 */
export async function clearAllRules(): Promise<void> {
  await db.delete(rdgRules)
}

/**
 * Mettre à jour le statut actif d'une catégorie entière
 */
export async function toggleCategoryActive(category: string, isActive: boolean): Promise<number> {
  await db
    .update(rdgRules)
    .set({ isActive })
    .where(eq(rdgRules.category, category))

  return 1 // Drizzle retourne le nombre de lignes affectées
}

/**
 * Obtenir les règles pour une annexe spécifique
 */
export async function getRulesByAnnex(annexNumber: string): Promise<RDGRule[]> {
  const rules = await db.query.rdgRules.findMany({
    where: eq(rdgRules.annexNumber, annexNumber),
  })

  return rules.map((rule) => ({
    id: rule.id,
    name: rule.name || undefined,
    description: rule.description || undefined,
    category: rule.category || undefined,
    annexNumber: rule.annexNumber || undefined,
    formula: rule.formula || undefined,
    tolerance: rule.tolerance ? Number(rule.tolerance) : undefined,
    isActive: rule.isActive || true,
    priority: rule.priority || 0,
    createdAt: rule.createdAt || new Date(),
    updatedAt: rule.updatedAt || new Date(),
  }))
}

/**
 * Obtenir les règles triées par priorité
 */
export async function getRulesByPriority(limit?: number): Promise<RDGRule[]> {
  let query = db.query.rdgRules.findMany()

  const rules = await query

  const sorted = rules.sort((a, b) => (b.priority || 0) - (a.priority || 0))

  return sorted.slice(0, limit).map((rule) => ({
    id: rule.id,
    name: rule.name || undefined,
    description: rule.description || undefined,
    category: rule.category || undefined,
    annexNumber: rule.annexNumber || undefined,
    formula: rule.formula || undefined,
    tolerance: rule.tolerance ? Number(rule.tolerance) : undefined,
    isActive: rule.isActive || true,
    priority: rule.priority || 0,
    createdAt: rule.createdAt || new Date(),
    updatedAt: rule.updatedAt || new Date(),
  }))
}
