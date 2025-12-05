/**
 * REGALICA AI - Retry Handler
 * Gestion des retries avec exponential backoff
 */

interface RetryOptions {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  retryableErrors: string[]
  onRetry?: (attempt: number, error: Error, delay: number) => void
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: [
    'RESOURCE_EXHAUSTED',
    'UNAVAILABLE',
    'DEADLINE_EXCEEDED',
    'INTERNAL',
    'fetch failed',
    'network',
    'timeout',
    'ECONNRESET',
    'ETIMEDOUT',
    '429', // Too Many Requests
    '500', // Internal Server Error
    '502', // Bad Gateway
    '503', // Service Unavailable
    '504', // Gateway Timeout
  ],
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error, retryableErrors: string[]): boolean {
  const errorMessage = error.message?.toLowerCase() || ''
  const errorName = error.name?.toLowerCase() || ''
  const errorString = String(error).toLowerCase()

  return retryableErrors.some((pattern) => {
    const lowerPattern = pattern.toLowerCase()
    return (
      errorMessage.includes(lowerPattern) ||
      errorName.includes(lowerPattern) ||
      errorString.includes(lowerPattern)
    )
  })
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  const jitter = Math.random() * 1000 // Add up to 1 second of jitter
  return Math.min(exponentialDelay + jitter, maxDelay)
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      const isRetryable = isRetryableError(lastError, opts.retryableErrors)
      const isLastAttempt = attempt === opts.maxRetries

      if (!isRetryable || isLastAttempt) {
        throw lastError
      }

      const delay = calculateDelay(attempt, opts.baseDelay, opts.maxDelay)

      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError, delay)
      } else {
        console.warn(
          `[AI Retry] Attempt ${attempt + 1}/${opts.maxRetries} failed, ` +
          `retrying in ${Math.round(delay)}ms: ${lastError.message}`
        )
      }

      await sleep(delay)
    }
  }

  throw lastError || new Error('Retry failed with unknown error')
}

/**
 * Create a retry wrapper with preset options
 */
export function createRetryWrapper(options: Partial<RetryOptions> = {}) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return withRetry(fn, mergedOptions)
  }
}

/**
 * Decorator for class methods
 */
export function Retryable(options: Partial<RetryOptions> = {}) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: unknown[]) {
      return withRetry(() => originalMethod.apply(this, args), options)
    }

    return descriptor
  }
}

export type { RetryOptions }
