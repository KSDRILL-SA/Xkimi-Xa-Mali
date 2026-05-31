import * as Sentry from '@sentry/nextjs'

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

function formatMeta(meta: LogMeta): LogMeta {
  return Object.fromEntries(
    Object.entries(meta).map(([k, v]) => [k, serialize(v)]),
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

  if (level === 'error') {
    const err = meta?.err ?? meta?.error
    if (err instanceof Error) {
      Sentry.captureException(err, {
        extra: formatted ? Object.fromEntries(
          Object.entries(formatted).filter(([k]) => k !== 'err' && k !== 'error')
        ) : undefined,
      })
    } else if (formatted) {
      Sentry.captureMessage(message, {
        level: 'error',
        extra: formatted as Record<string, unknown>,
      })
    }
  }

  if (level === 'warn') {
    Sentry.addBreadcrumb({ message, level: 'warning', data: formatted })
  }
}

export const logger = {
  debug: (message: string, meta?: LogMeta): void => write('debug', message, meta),
  info:  (message: string, meta?: LogMeta): void => write('info',  message, meta),
  warn:  (message: string, meta?: LogMeta): void => write('warn',  message, meta),
  error: (message: string, meta?: LogMeta): void => write('error', message, meta),

  // Convenience: time an async operation and log duration
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
