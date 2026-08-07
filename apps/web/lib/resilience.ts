export type RetryOptions = {
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  factor?: number
  onRetry?: (error: unknown, attempt: number) => void
  shouldRetry?: (error: unknown) => boolean
}

/**
 * Run an async operation with exponential backoff + jitter.
 *
 * IMPORTANT: only use on **idempotent** operations (reads, path-idempotent
 * writes, queue-deduped sends). Never wrap a non-idempotent money mutation
 * (e.g. a raw debit submission) — a retry after a lost response could double it.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 200,
    maxDelayMs = 4_000,
    factor = 2,
    onRetry,
    shouldRetry = () => true,
  } = opts

  let attempt = 0
  for (;;) {
    try {
      return await fn()
    } catch (error) {
      attempt++
      if (attempt > retries || !shouldRetry(error)) throw error
      const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt - 1))
      const delay = Math.round(backoff * (0.5 + Math.random())) // jitter
      onRetry?.(error, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

/**
 * Minimal circuit breaker: after `threshold` consecutive failures it opens for
 * `cooldownMs`, failing fast instead of hammering a sick dependency, then
 * half-opens to probe recovery.
 */
export class CircuitBreaker {
  private failures = 0
  private openedAt: number | null = null

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.openedAt !== null) {
      if (Date.now() - this.openedAt < this.cooldownMs) {
        throw new Error('Circuit breaker is open')
      }
      this.openedAt = null // half-open: allow one trial call
    }
    try {
      const result = await fn()
      this.failures = 0
      return result
    } catch (error) {
      this.failures++
      if (this.failures >= this.threshold) this.openedAt = Date.now()
      throw error
    }
  }
}
