import { db } from '../db'
import { validations, ruleResults } from '../db/schema'
import { eq } from 'drizzle-orm'
import { Validation, RuleResult, ValidationStatus, RuleStatus } from '../types'
import { generateId, calculateSuccessRate } from '../lib/utils'

export async function createValidation(uploadId: string, userId: string): Promise<Validation> {
  const id = generateId()
  const now = new Date()

  await db.insert(validations).values({
    id,
    uploadId,
    userId,
    status: 'pending',
    totalRules: 0,
    passedRules: 0,
    failedRules: 0,
    warningRules: 0,
    pendingRules: 0,
    successRate: '0',
    createdAt: now,
  })

  return {
    id,
    uploadId,
    userId,
    status: 'pending',
    totalRules: 0,
    passedRules: 0,
    failedRules: 0,
    warningRules: 0,
    pendingRules: 0,
    successRate: 0,
    createdAt: now,
  }
}

export async function getValidationById(id: string): Promise<Validation | null> {
  const validation = await db.query.validations.findFirst({
    where: eq(validations.id, id),
  })

  if (!validation) return null

  return {
    id: validation.id,
    uploadId: validation.uploadId,
    userId: validation.userId,
    status: (validation.status || 'pending') as ValidationStatus,
    totalRules: validation.totalRules || 0,
    passedRules: validation.passedRules || 0,
    failedRules: validation.failedRules || 0,
    warningRules: validation.warningRules || 0,
    pendingRules: validation.pendingRules || 0,
    successRate: Number(validation.successRate),
    startedAt: validation.startedAt || undefined,
    completedAt: validation.completedAt || undefined,
    createdAt: validation.createdAt || new Date(),
  }
}

export async function updateValidationStatus(id: string, status: ValidationStatus): Promise<Validation | null> {
  const now = new Date()
  const updateData: Record<string, unknown> = { status }

  if (status === 'in_progress') {
    updateData.startedAt = now
  } else if (status === 'completed') {
    updateData.completedAt = now
  }

  await db.update(validations).set(updateData).where(eq(validations.id, id))
  return getValidationById(id)
}

export async function addRuleResult(validationId: string, result: Omit<RuleResult, 'id' | 'createdAt' | 'validationId'>): Promise<RuleResult> {
  const id = generateId()
  const now = new Date()

  await db.insert(ruleResults).values({
    id,
    validationId,
    ruleId: result.ruleId,
    ruleName: result.ruleName,
    ruleCategory: result.ruleCategory,
    status: result.status,
    expectedValue: result.expectedValue,
    calculatedValue: result.calculatedValue,
    tolerance: result.tolerance ? result.tolerance.toString() : undefined,
    message: result.message,
    details: result.details,
    createdAt: now,
  })

  return {
    id,
    validationId,
    ruleId: result.ruleId,
    ruleName: result.ruleName,
    ruleCategory: result.ruleCategory,
    status: result.status,
    expectedValue: result.expectedValue,
    calculatedValue: result.calculatedValue,
    tolerance: result.tolerance,
    message: result.message,
    details: result.details,
    createdAt: now,
  }
}

export async function getRuleResultsByValidationId(validationId: string): Promise<RuleResult[]> {
  const results = await db.query.ruleResults.findMany({
    where: eq(ruleResults.validationId, validationId),
  })

  return results.map((result) => ({
    id: result.id,
    validationId: result.validationId,
    ruleId: result.ruleId,
    ruleName: result.ruleName || undefined,
    ruleCategory: result.ruleCategory || undefined,
    status: (result.status || 'pending') as RuleStatus,
    expectedValue: result.expectedValue || undefined,
    calculatedValue: result.calculatedValue || undefined,
    tolerance: result.tolerance ? Number(result.tolerance) : undefined,
    message: result.message || undefined,
    details: (result.details as Record<string, unknown>) || undefined,
    createdAt: result.createdAt || new Date(),
  }))
}

export async function updateValidationStats(validationId: string): Promise<Validation | null> {
  const results = await getRuleResultsByValidationId(validationId)

  const stats = {
    totalRules: results.length,
    passedRules: results.filter((r) => r.status === 'passed').length,
    failedRules: results.filter((r) => r.status === 'failed').length,
    warningRules: results.filter((r) => r.status === 'warning').length,
    pendingRules: results.filter((r) => r.status === 'pending').length,
  }

  const successRate = calculateSuccessRate(stats.passedRules, stats.totalRules)

  await db.update(validations).set({
    ...stats,
    successRate: successRate.toString(),
  }).where(eq(validations.id, validationId))

  return getValidationById(validationId)
}

export async function getValidationsByUploadId(uploadId: string): Promise<Validation[]> {
  const validationsList = await db.query.validations.findMany({
    where: eq(validations.uploadId, uploadId),
  })

  return validationsList.map((v) => ({
    id: v.id,
    uploadId: v.uploadId,
    userId: v.userId,
    status: (v.status || 'pending') as ValidationStatus,
    totalRules: v.totalRules || 0,
    passedRules: v.passedRules || 0,
    failedRules: v.failedRules || 0,
    warningRules: v.warningRules || 0,
    pendingRules: v.pendingRules || 0,
    successRate: Number(v.successRate),
    startedAt: v.startedAt || undefined,
    completedAt: v.completedAt || undefined,
    createdAt: v.createdAt || new Date(),
  }))
}

export async function getValidationsByUserId(userId: string, limit: number = 10, offset: number = 0): Promise<Validation[]> {
  const validationsList = await db.query.validations.findMany({
    where: eq(validations.userId, userId),
    limit,
    offset,
  })

  return validationsList.map((v) => ({
    id: v.id,
    uploadId: v.uploadId,
    userId: v.userId,
    status: (v.status || 'pending') as ValidationStatus,
    totalRules: v.totalRules || 0,
    passedRules: v.passedRules || 0,
    failedRules: v.failedRules || 0,
    warningRules: v.warningRules || 0,
    pendingRules: v.pendingRules || 0,
    successRate: Number(v.successRate),
    startedAt: v.startedAt || undefined,
    completedAt: v.completedAt || undefined,
    createdAt: v.createdAt || new Date(),
  }))
}
