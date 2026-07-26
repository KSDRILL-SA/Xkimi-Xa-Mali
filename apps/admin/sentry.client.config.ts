import * as Sentry from '@sentry/nextjs'

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
