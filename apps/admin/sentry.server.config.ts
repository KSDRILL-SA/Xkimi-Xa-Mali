import * as Sentry from '@sentry/nextjs'
import { deploymentEnvironmentName } from '@xxm/utils'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  // NODE_ENV is "production" for every optimised build, preview deploys
  // included — see packages/utils/src/deployment.ts. Tagging Sentry events
  // with it merged preview-deployment errors into "production" in the
  // dashboard, indistinguishable from a real incident.
  environment: deploymentEnvironmentName(),
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies
    return event
  },
})
