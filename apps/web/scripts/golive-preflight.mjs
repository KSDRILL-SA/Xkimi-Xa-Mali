/**
 * Reports which variables are still missing for go-live, on every production
 * build, in the Vercel build log.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `lib/env.ts` makes a set of variables required only on a *live* deployment
 * (`isLiveDeployment()` — `DEPLOY_ENV`, else `VERCEL_ENV`, else `NODE_ENV`).
 * The production deployment currently runs with `DEPLOY_ENV` set to something
 * other than `production`, so all of them are optional and the app boots
 * happily without them.
 *
 * Flipping `DEPLOY_ENV` to `production` makes every one of them mandatory **at
 * the same moment**. If any is absent, env validation throws at boot and the
 * deployment fails — and the failure arrives as a wall of Zod errors, at the
 * exact moment someone is trying to go live, usually under time pressure.
 *
 * That is a bad time to discover that, say, `BLOB_READ_WRITE_TOKEN` was never
 * set. It is unrelated to the gateway credentials being wired up that day, so
 * it reads as a mysterious failure of whatever was actually being changed.
 *
 * So this runs on every production build and prints the same check the switch
 * will perform, while it is still only a report. Turn the switch on when this
 * says nothing is missing.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 *
 * It never prints a value — only the name and whether something is set. It
 * never fails the build: while the deployment is not live these variables are
 * legitimately optional, and failing would block deploys for a condition that
 * is not yet an error. Once the deployment *is* live, `lib/env.ts` enforces
 * them properly and this is only an explanation of what went wrong.
 *
 * Kept honest by `__tests__/golive-preflight.test.ts`, which parses
 * `lib/env.ts` and fails if a variable is added to either gate without being
 * listed here — otherwise this drifts into quiet dishonesty, which is worse
 * than not having it.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Required outright on a live deployment (`requiredWhenLive` in lib/env.ts). */
export const REQUIRED_WHEN_LIVE = [
  'NEXTAUTH_URL',
  'NETCASH_DEBICHECK_TEMPLATE_ID',
  'BULKSMS_USERNAME',
  'BULKSMS_PASSWORD',
  'RESEND_API_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'BLOB_READ_WRITE_TOKEN',
  'ADMIN_API_SECRET',
]

/**
 * Have a development placeholder, but must be set explicitly once live
 * (`configuredWhenLive`). The placeholder is what makes these dangerous: they
 * are never absent, so nothing looks wrong — they are just quietly the dev
 * value in production.
 */
export const CONFIGURED_WHEN_LIVE = [
  'NETCASH_API_URL',
  'RESEND_FROM_EMAIL',
  'ADMIN_WHATSAPP_NUMBER',
  'SUPPORT_EMAIL',
  'NEXT_PUBLIC_ADMIN_URL',
  'NEXT_PUBLIC_SITE_URL',
]

/** Required when live *and* the gateway is not the mock (`netcashCredential`). */
export const NETCASH_CREDENTIALS = ['NETCASH_SERVICE_KEY', 'NETCASH_WEBHOOK_SECRET']

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ live: boolean, mockGateway: boolean, missing: string[], checked: string[] }}
 */
export function preflight(env) {
  const deployEnv = env.DEPLOY_ENV
  const live = deployEnv
    ? deployEnv === 'production'
    : env.VERCEL_ENV
      ? env.VERCEL_ENV === 'production'
      : env.NODE_ENV === 'production'

  const mockGateway = env.PAYMENT_GATEWAY === 'mock'

  const checked = [
    ...REQUIRED_WHEN_LIVE,
    ...CONFIGURED_WHEN_LIVE,
    ...(mockGateway ? [] : NETCASH_CREDENTIALS),
  ]

  const missing = checked.filter((name) => {
    const value = env[name]
    return value === undefined || value === ''
  })

  return { live, mockGateway, missing, checked }
}

const log = (msg) => console.log(`[go-live] ${msg}`)

function main() {
  // Only meaningful where the real production variables exist. A local or CI
  // build has none of them and would report everything missing, which is noise.
  if (!process.env.VERCEL || process.env.VERCEL_ENV !== 'production') return 0

  const { live, mockGateway, missing, checked } = preflight(process.env)

  log(`deployment is ${live ? 'LIVE' : 'NOT live'}; payment gateway is ${mockGateway ? 'mock' : 'real'}`)

  if (missing.length === 0) {
    log(`all ${checked.length} go-live variables are set.`)
    if (!live) log('nothing is missing — DEPLOY_ENV can be switched to "production".')
    return 0
  }

  log(`${missing.length} of ${checked.length} go-live variables are NOT set:`)
  for (const name of missing) log(`  missing: ${name}`)

  if (live) {
    log('this deployment is already live, so these are hard failures — see the env validation error above.')
  } else {
    log('these are optional today because DEPLOY_ENV is not "production".')
    log('Switching it before setting them will fail the deployment at boot.')
  }

  return 0
}

// Importing this module for its exports must not print a report, so the side
// effects only happen when it runs directly as the build step.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
