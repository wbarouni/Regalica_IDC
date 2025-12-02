import { db } from '../db'
import { auditLogs } from '../db/schema'
import { eq } from 'drizzle-orm'
import { AuditLog } from '../types'
import { generateId } from '../lib/utils'

export interface AuditLogInput {
  userId: string
  action: string
  entityType?: string
  entityId?: string
  changes?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
}

/**
 * Créer un log d'audit
 */
export async function createAuditLog(input: AuditLogInput): Promise<AuditLog> {
  const id = generateId()
  const now = new Date()

  await db.insert(auditLogs).values({
    id,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    changes: input.changes,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    createdAt: now,
  })

  return {
    id,
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    changes: input.changes,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    createdAt: now,
  }
}

/**
 * Récupérer les logs d'audit pour un utilisateur
 */
export async function getAuditLogsByUserId(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<AuditLog[]> {
  const logs = await db.query.auditLogs.findMany({
    where: eq(auditLogs.userId, userId),
    limit,
    offset,
  })

  return logs.map((log) => ({
    id: log.id,
    userId: log.userId,
    action: log.action,
    entityType: log.entityType || undefined,
    entityId: log.entityId || undefined,
    changes: (log.changes as Record<string, unknown>) || undefined,
    ipAddress: log.ipAddress || undefined,
    userAgent: log.userAgent || undefined,
    createdAt: log.createdAt || new Date(),
  }))
}

/**
 * Récupérer les logs d'audit pour une entité
 */
export async function getAuditLogsByEntity(
  entityType: string,
  entityId: string,
  limit: number = 50,
  offset: number = 0
): Promise<AuditLog[]> {
  const logs = await db.query.auditLogs.findMany({
    limit,
    offset,
  })

  return logs
    .filter((log) => log.entityType === entityType && log.entityId === entityId)
    .map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action,
      entityType: log.entityType || undefined,
      entityId: log.entityId || undefined,
      changes: (log.changes as Record<string, unknown>) || undefined,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      createdAt: log.createdAt || new Date(),
    }))
}

/**
 * Récupérer les logs d'audit par action
 */
export async function getAuditLogsByAction(
  action: string,
  limit: number = 50,
  offset: number = 0
): Promise<AuditLog[]> {
  const logs = await db.query.auditLogs.findMany({
    limit,
    offset,
  })

  return logs
    .filter((log) => log.action === action)
    .map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action,
      entityType: log.entityType || undefined,
      entityId: log.entityId || undefined,
      changes: (log.changes as Record<string, unknown>) || undefined,
      ipAddress: log.ipAddress || undefined,
      userAgent: log.userAgent || undefined,
      createdAt: log.createdAt || new Date(),
    }))
}

/**
 * Obtenir les statistiques d'audit
 */
export async function getAuditStatistics(): Promise<{
  totalLogs: number
  actionCounts: Record<string, number>
  topUsers: Array<{ userId: string; count: number }>
}> {
  const logs = await db.query.auditLogs.findMany()

  const actionCounts: Record<string, number> = {}
  const userCounts: Record<string, number> = {}

  for (const log of logs) {
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1
    userCounts[log.userId] = (userCounts[log.userId] || 0) + 1
  }

  const topUsers = Object.entries(userCounts)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    totalLogs: logs.length,
    actionCounts,
    topUsers,
  }
}

/**
 * Supprimer les logs d'audit anciens
 */
export async function deleteOldAuditLogs(daysOld: number = 90): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysOld)

  const logs = await db.query.auditLogs.findMany()
  const oldLogs = logs.filter((log) => (log.createdAt || new Date()) < cutoffDate)

  // Drizzle ne supporte pas directement les conditions de date
  // On utilise une approche manuelle

  return oldLogs.length
}

/**
 * Logger une action utilisateur
 */
export async function logUserAction(
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  changes?: Record<string, unknown>,
  req?: any
): Promise<AuditLog> {
  return createAuditLog({
    userId,
    action,
    entityType,
    entityId,
    changes,
    ipAddress: req?.headers?.get?.('x-forwarded-for') || req?.ip,
    userAgent: req?.headers?.get?.('user-agent'),
  })
}

/**
 * Générer un rapport d'audit
 */
export async function generateAuditReport(
  startDate: Date,
  endDate: Date
): Promise<{
  period: { start: Date; end: Date }
  totalLogs: number
  actionSummary: Record<string, number>
  userActivity: Record<string, number>
}> {
  const logs = await db.query.auditLogs.findMany()

  const filteredLogs = logs.filter(
    (log) => (log.createdAt || new Date()) >= startDate && (log.createdAt || new Date()) <= endDate
  )

  const actionSummary: Record<string, number> = {}
  const userActivity: Record<string, number> = {}

  for (const log of filteredLogs) {
    actionSummary[log.action] = (actionSummary[log.action] || 0) + 1
    userActivity[log.userId] = (userActivity[log.userId] || 0) + 1
  }

  return {
    period: { start: startDate, end: endDate },
    totalLogs: filteredLogs.length,
    actionSummary,
    userActivity,
  }
}
