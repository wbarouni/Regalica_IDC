import { randomUUID } from 'crypto'

export function generateId(): string {
  return randomUUID()
}

export function formatDate(date: Date): string {
  return date.toISOString()
}

export function parseDate(dateString: string): Date {
  return new Date(dateString)
}

export function calculateSuccessRate(passed: number, total: number): number {
  if (total === 0) return 0
  return Math.round((passed / total) * 10000) / 100
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '')
}

export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}
