import { logger } from '@/lib/logger';

type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CBState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private readonly name: string,
    private readonly failureThreshold = 5,
    private readonly resetTimeoutMs = 60_000,
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit half-open', { circuit: this.name });
      } else {
        throw new Error(`Circuit OPEN — service ${this.name} temporairement indisponible`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    }
  }

  getState(): CBState { return this.state; }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      logger.info('Circuit closed after recovery', { circuit: this.name });
    }
    this.state = 'CLOSED';
    this.failureCount = 0;
  }

  private onFailure(err: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    logger.warn('Circuit failure recorded', {
      circuit: this.name,
      failureCount: this.failureCount,
      threshold: this.failureThreshold,
      error: err instanceof Error ? err.message : String(err),
    });
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logger.error('Circuit opened', { circuit: this.name, failureCount: this.failureCount });
    }
  }
}
