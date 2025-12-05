/**
 * REGALICA AI - Cache Manager
 * Gestion du cache pour les réponses AI
 */

import crypto from 'crypto'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number
  hits: number
  key: string
}

interface CacheConfig {
  maxSize: number
  defaultTTL: number
  cleanupInterval: number
  enableLogging: boolean
}

interface CacheStats {
  size: number
  hits: number
  misses: number
  hitRate: number
  oldestEntry: number | null
  newestEntry: number | null
}

const DEFAULT_CONFIG: CacheConfig = {
  maxSize: 500,
  defaultTTL: 15 * 60 * 1000, // 15 minutes
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
  enableLogging: false,
}

class AIResponseCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map()
  private config: CacheConfig
  private cleanupTimer: NodeJS.Timeout | null = null
  private totalHits = 0
  private totalMisses = 0

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.startCleanup()
  }

  /**
   * Generate a unique cache key
   */
  private generateKey(
    identifier: string,
    context?: Record<string, unknown>
  ): string {
    const content = JSON.stringify({ identifier, context })
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }

  /**
   * Log message if logging is enabled
   */
  private log(message: string): void {
    if (this.config.enableLogging) {
      console.log(`[AICache] ${message}`)
    }
  }

  /**
   * Get an item from cache
   */
  get<T>(identifier: string, context?: Record<string, unknown>): T | null {
    const key = this.generateKey(identifier, context)
    const entry = this.cache.get(key)

    if (!entry) {
      this.totalMisses++
      this.log(`MISS: ${key.slice(0, 8)}...`)
      return null
    }

    // Check if expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key)
      this.totalMisses++
      this.log(`EXPIRED: ${key.slice(0, 8)}...`)
      return null
    }

    // Update hits
    entry.hits++
    this.totalHits++
    this.log(`HIT: ${key.slice(0, 8)}... (${entry.hits} hits)`)

    return entry.data as T
  }

  /**
   * Set an item in cache
   */
  set<T>(
    identifier: string,
    data: T,
    context?: Record<string, unknown>,
    ttl?: number
  ): void {
    const key = this.generateKey(identifier, context)

    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize) {
      this.evictLRU()
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.defaultTTL,
      hits: 0,
      key,
    })

    this.log(`SET: ${key.slice(0, 8)}... (size: ${this.cache.size})`)
  }

  /**
   * Get or fetch with automatic caching
   */
  async getOrFetch<T>(
    identifier: string,
    fetchFn: () => Promise<T>,
    context?: Record<string, unknown>,
    ttl?: number
  ): Promise<{ data: T; cached: boolean }> {
    // Check cache first
    const cached = this.get<T>(identifier, context)

    if (cached !== null) {
      return { data: cached, cached: true }
    }

    // Fetch and cache
    const data = await fetchFn()
    this.set(identifier, data, context, ttl)

    return { data, cached: false }
  }

  /**
   * Delete an item from cache
   */
  delete(identifier: string, context?: Record<string, unknown>): boolean {
    const key = this.generateKey(identifier, context)
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.log(`DELETE: ${key.slice(0, 8)}...`)
    }
    return deleted
  }

  /**
   * Check if item exists in cache
   */
  has(identifier: string, context?: Record<string, unknown>): boolean {
    const key = this.generateKey(identifier, context)
    const entry = this.cache.get(key)

    if (!entry) return false

    // Check expiration
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null
    let lruHits = Infinity
    let lruTime = Infinity

    for (const [key, entry] of this.cache.entries()) {
      // Prioritize by hits, then by age
      if (entry.hits < lruHits || (entry.hits === lruHits && entry.timestamp < lruTime)) {
        lruHits = entry.hits
        lruTime = entry.timestamp
        lruKey = key
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey)
      this.log(`EVICT: ${lruKey.slice(0, 8)}... (LRU)`)
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.log(`CLEANUP: Removed ${cleaned} expired entries`)
    }
  }

  /**
   * Start automatic cleanup
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupInterval)

    // Don't prevent Node from exiting
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref()
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let oldestEntry: number | null = null
    let newestEntry: number | null = null

    for (const entry of this.cache.values()) {
      if (oldestEntry === null || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp
      }
      if (newestEntry === null || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp
      }
    }

    const totalRequests = this.totalHits + this.totalMisses

    return {
      size: this.cache.size,
      hits: this.totalHits,
      misses: this.totalMisses,
      hitRate: totalRequests > 0 ? this.totalHits / totalRequests : 0,
      oldestEntry,
      newestEntry,
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.log('CLEAR: All entries removed')
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.totalHits = 0
    this.totalMisses = 0
  }

  /**
   * Destroy cache and stop cleanup
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.clear()
    this.log('DESTROY: Cache destroyed')
  }
}

// Singleton instance
let cacheInstance: AIResponseCache | null = null

export function getAICache(): AIResponseCache {
  if (!cacheInstance) {
    cacheInstance = new AIResponseCache({
      maxSize: parseInt(process.env.AI_CACHE_MAX_SIZE || '500'),
      defaultTTL: parseInt(process.env.AI_CACHE_TTL || String(15 * 60 * 1000)),
      enableLogging: process.env.AI_CACHE_LOGGING === 'true',
    })
  }
  return cacheInstance
}

export { AIResponseCache }
export type { CacheConfig, CacheStats }
