import * as Sentry from '@sentry/nextjs'

/**
 * Client-side Sentry init.
 *
 * `sentry.client.config.ts` was the convention before `@sentry/nextjs` v8 —
 * Next.js does not auto-load a file by that name, and nothing else imported
 * it, so it sat there as dead code. Every browser-side error (React error
 * boundaries among them — including the "Something went wrong" screen an
 * admin sees when a server action fails) went uncaptured with no signal
 * that anything was wrong: `window.__SENTRY__` was simply never set.
 * `instrumentation.ts` covers the server and edge runtimes; this file is
 * what Next.js actually loads for the client one.
 */
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    // Every admin error is worth a replay: this app moves money and grants
    // roles, and there are only a handful of admins, so the volume is trivial.
    // No idle session sampling — recording routine admin browsing would capture
    // members' personal data for no reason.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event) {
      if (event.request?.cookies) delete event.request.cookies
      return event
    },
  })
}
