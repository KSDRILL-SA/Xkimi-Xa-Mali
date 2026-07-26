import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Next only reports server-side errors — including those thrown inside React
// Server Components and server actions, which is nearly everything this app
// does — through this hook. Without it those errors never reach Sentry.
export const onRequestError = Sentry.captureRequestError
