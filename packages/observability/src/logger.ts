import * as Sentry from '@sentry/nextjs'
import { redact } from './redact'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogMeta = Record<string, unknown>

const isDev = process.env.NODE_ENV !== 'production'

const LEVEL_EMOJI: Record<LogLevel, string> = {
  debug: '🔍',
  info:  '📋',
  warn:  '⚠️ ',
  error: '🚨',
}

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: isDev ? value.stack : undefined,
      ...(value as unknown as Record<string, unknown>),
    }
  }
  return value
}

/**
 * Serialise, then redact — in that order, and the order matters.
 *
 * `serialize` spreads an Error's own enumerable properties into the entry,
 * which is how a provider error carrying a recipient address gets in without
 * any call site naming it. Redacting afterwards sees those fields; redacting
 * first would not. See redact.ts.
 */
function formatMeta(meta: LogMeta): LogMeta {
  const serialised = Object.fromEntries(
    Object.entries(meta).map(([k, v]) => [k, serialize(v)]),
  )
  return redact(serialised) as LogMeta
}

/** Everything except the error itself — Sentry shows the exception separately. */
function extrasWithoutError(formatted: LogMeta | undefined): Record<string, unknown> | undefined {
  if (!formatted) return undefined
  return Object.fromEntries(
    Object.entries(formatted).filter(([k]) => k !== 'err' && k !== 'error'),
  )
}

function write(level: LogLevel, message: string, meta?: LogMeta): void {
  const formatted = meta ? formatMeta(meta) : undefined

  if (isDev) {
    const extras = formatted ? ` ${JSON.stringify(formatted, null, 0)}` : ''
    const fn = level === 'debug' ? console.log : console[level]
    fn(`${LEVEL_EMOJI[level]} [${level.toUpperCase()}] ${message}${extras}`)
  } else {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...formatted,
    }
    const fn = level === 'debug' ? console.log : console[level]
    fn(JSON.stringify(entry))
  }

  // Every error reaches Sentry, with or without metadata. An earlier version
  // only reported when meta was present, so `logger.error('payment failed')`
  // on its own was written to the console and then silently dropped — the exact
  // shape of call a developer reaches for in a hurry.
  if (level === 'error') {
    const err = meta?.err ?? meta?.error
    if (err instanceof Error) {
      Sentry.captureException(err, { extra: extrasWithoutError(formatted) })
    } else {
      Sentry.captureMessage(message, {
        level: 'error',
        ...(formatted && { extra: formatted as Record<string, unknown> }),
      })
    }
  }

  if (level === 'warn') {
    Sentry.addBreadcrumb({ message, level: 'warning', data: formatted })
  }
}

/**
 * Structured logging for the authenticated apps.
 *
 * Human-readable in development, one JSON object per line in production so a log
 * drain can parse it. Errors and warnings additionally reach Sentry — errors as
 * an exception (or a message when there is no Error to attach), warnings as a
 * breadcrumb, so the trail leading up to a failure survives with it.
 *
 * Pass the error under `err` or `error` in the metadata and it is reported as a
 * real exception with a stack, rather than a flat string.
 */
export const logger = {
  debug: (message: string, meta?: LogMeta): void => write('debug', message, meta),
  info:  (message: string, meta?: LogMeta): void => write('info',  message, meta),
  warn:  (message: string, meta?: LogMeta): void => write('warn',  message, meta),
  error: (message: string, meta?: LogMeta): void => write('error', message, meta),

  /** Time an async operation, logging its duration — and its failure, if it fails. */
  async timed<T>(label: string, fn: () => Promise<T>, meta?: LogMeta): Promise<T> {
    const start = Date.now()
    try {
      const result = await fn()
      write('debug', `${label} completed`, { ...meta, durationMs: Date.now() - start })
      return result
    } catch (err) {
      write('error', `${label} failed`, { ...meta, err, durationMs: Date.now() - start })
      throw err
    }
  },
}
