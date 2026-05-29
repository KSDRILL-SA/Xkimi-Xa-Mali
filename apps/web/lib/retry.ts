import { logger } from './logger'

export type RetryOptions = {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs?: number
  label: string
  // Return false to skip retrying (e.g. 4xx client errors are permanent failures)
  retryIf?: (err: unknown) => boolean
}

// Don't retry 4xx — those are the caller's fault (bad request, not found, etc.)
function defaultRetryIf(err: unknown): boolean {
  const status =
    (err as { statusCode?: number })?.statusCode ??
    (err as { status?: number })?.status

  if (status !== undefined && status >= 400 && status < 500) return false
  return true
}

// Full-jitter exponential backoff: delay ∈ [0, min(baseDelayMs * 2^attempt, maxDelayMs)]
function jitteredDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const cap = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
  return Math.floor(Math.random() * cap)
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxAttempts,
    baseDelayMs,
    maxDelayMs = 30_000,
    label,
    retryIf = defaultRetryIf,
  } = options

  let lastErr: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err

      if (attempt === maxAttempts || !retryIf(err)) {
        if (attempt > 1) {
          logger.error(`${label} failed permanently after ${attempt} attempt(s)`, { err, attempt })
        }
        throw err
      }

      const delayMs = jitteredDelay(attempt, baseDelayMs, maxDelayMs)
      logger.warn(`${label} attempt ${attempt}/${maxAttempts} failed — retrying in ${delayMs}ms`, {
        err,
        attempt,
        delayMs,
      })

      await new Promise<void>((r) => setTimeout(r, delayMs))
    }
  }

  throw lastErr
}
