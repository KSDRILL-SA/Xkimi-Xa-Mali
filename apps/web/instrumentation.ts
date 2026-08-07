import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Next.js only reports server-side errors — including those thrown inside React
// Server Components — to instrumentation via this hook. Without it those errors
// never reach Sentry.
export const onRequestError = Sentry.captureRequestError
