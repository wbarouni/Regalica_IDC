import { db } from '../db'
import { rdgRules } from '../db/schema'
import { eq } from 'drizzle-orm'
import { RDGRule } from '../types'

export async function getRuleById(id: string): Promise<RDGRule | null> {
  const rule = await db.query.rdgRules.findFirst({
    where: eq(rdgRules.id, id),
  })

  if (!rule) return null

  return {
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
  }
}

export async function getRulesByCategory(category: string): Promise<RDGRule[]> {
  const rulesList = await db.query.rdgRules.findMany({
    where: eq(rdgRules.category, category),
  })

  return rulesList.map((rule) => ({
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

export async function getActiveRules(): Promise<RDGRule[]> {
  const rulesList = await db.query.rdgRules.findMany({
    where: eq(rdgRules.isActive, true),
  })

  return rulesList.map((rule) => ({
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

export async function getAllRules(limit: number = 100, offset: number = 0): Promise<RDGRule[]> {
  const rulesList = await db.query.rdgRules.findMany({
    limit,
    offset,
  })

  return rulesList.map((rule) => ({
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

export async function createRule(rule: Omit<RDGRule, 'createdAt' | 'updatedAt'>): Promise<RDGRule> {
  const now = new Date()

  await db.insert(rdgRules).values({
    id: rule.id,
    name: rule.name || undefined,
    description: rule.description || undefined,
    category: rule.category || undefined,
    annexNumber: rule.annexNumber || undefined,
    formula: rule.formula || undefined,
    tolerance: rule.tolerance ? rule.tolerance.toString() : undefined,
    isActive: rule.isActive,
    priority: rule.priority,
    createdAt: now,
    updatedAt: now,
  })

  return {
    ...rule,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updateRule(id: string, updates: Partial<RDGRule>): Promise<RDGRule | null> {
  const now = new Date()

  const updateData: any = { ...updates, updatedAt: now }
  if (updateData.tolerance !== undefined) {
    updateData.tolerance = updateData.tolerance.toString()
  }
  await db.update(rdgRules).set(updateData).where(eq(rdgRules.id, id))

  return getRuleById(id)
}

export async function toggleRuleActive(id: string): Promise<RDGRule | null> {
  const rule = await getRuleById(id)
  if (!rule) return null

  return updateRule(id, { isActive: !rule.isActive })
}
