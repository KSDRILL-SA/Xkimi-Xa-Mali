import * as Sentry from '@sentry/nextjs'
import { deploymentEnvironmentName } from '@xxm/utils'

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: deploymentEnvironmentName(),
  tracesSampleRate: 0,
})
