/**
 * REGALICA AI - Types Index
 * Export centralisé de tous les types AI
 */

export * from './validator.types'
export * from './assistant.types'

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface AIConfig {
  geminiApiKey: string
  geminiModel: string
  deepseekApiKey?: string
  deepseekModel?: string
  maxRetries: number
  timeout: number
  temperature: number
  maxOutputTokens: number
  enableCache: boolean
  cacheTTL: number
  enableFallback: boolean
}

export interface TokenUsage {
  input: number
  output: number
  total: number
}

export interface CacheStats {
  hits: number
  misses: number
  hitRate: number
  size: number
}

export interface AIMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  averageTokensUsed: number
  cacheHitRate: number
  fallbackRate: number
  errorsByType: Record<string, number>
}
