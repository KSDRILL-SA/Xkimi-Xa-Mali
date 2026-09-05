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
 * That is a bad time to discover that, say, `UPSTASH_REDIS_REST_TOKEN` was never
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
  'BULKSMS_USERNAME',
  'BULKSMS_PASSWORD',
  'RESEND_API_KEY',
  'INNGEST_EVENT_KEY',
  'INNGEST_SIGNING_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'ADMIN_API_SECRET',
]

/**
 * Have a development placeholder, but must be set explicitly once live
 * (`configuredWhenLive`). The placeholder is what makes these dangerous: they
 * are never absent, so nothing looks wrong — they are just quietly the dev
 * value in production.
 */
export const CONFIGURED_WHEN_LIVE = [
  'RESEND_FROM_EMAIL',
  'ADMIN_WHATSAPP_NUMBER',
  'SUPPORT_EMAIL',
  'NEXT_PUBLIC_ADMIN_URL',
  'NEXT_PUBLIC_SITE_URL',
]

/** Required when live *and* the gateway is not the mock (`netcashCredential`). */
export const NETCASH_CREDENTIALS = ['NETCASH_SERVICE_KEY', 'NETCASH_WEBHOOK_SECRET']

/**
 * Netcash endpoint configuration — needed when Netcash is actually called, not
 * merely when the deployment is live.
 *
 * These sat in the two lists above until the DebiCheck application was declined
 * and it became clear the distinction was real: a live deployment with no
 * provider is a state this system is in, and demanding an endpoint to point at
 * for a service nothing submits to blocked it from booting at all.
 */
export const NETCASH_CONFIG = ['NETCASH_API_URL', 'NETCASH_DEBICHECK_TEMPLATE_ID']

/**
 * Not required to boot, and reported anyway.
 *
 * These two are what let `backup-watch` read the Backup workflow's history. Without
 * them `checkBackupFreshness` returns `unknown`, and the daily job raises
 * `BACKUP_WATCH_BLIND` at **warning** — "cannot confirm the backup is running" —
 * instead of `BACKUP_NOT_RUNNING` at **critical**.
 *
 * That difference is the whole point of listing them here. The dead-man's switch
 * exists because a backup that stops produces no run, no failure and no alert;
 * blind, it degrades into a mild warning about itself, and the one condition it
 * was built to catch is the one it cannot report. Nothing else would ever say so:
 * they are `.optional()` in `lib/env.ts`, so env validation is happy, the
 * deployment is happy, and the report was silent.
 *
 * Advisory, not blocking. Their absence is not a reason to refuse a go-live —
 * it is a reason to know.
 */
export const WATCHDOG_VARS = ['BACKUP_REPO', 'BACKUP_WATCH_TOKEN']

/**
 * The account members are told to pay into.
 *
 * With no gateway, a contribution arrives because a member reads these four
 * values off their screen and sends money to them. They have defaults in
 * `lib/group-account.ts`, deliberately: a missing variable must never blank out
 * the details somebody needs in order to pay.
 *
 * Which is exactly why they are reported here. The defaults mean nothing ever
 * looks wrong, and none of the four is set in production today — so the account
 * shown to members lives in the source, and changing banks is a release rather
 * than a configuration change. Nobody would discover that until the day they
 * needed it to be otherwise.
 *
 * Advisory, never blocking. Serving the default account is a working state, not
 * a broken one.
 */
export const GROUP_ACCOUNT_VARS = [
  'NEXT_PUBLIC_GROUP_ACCOUNT_NAME',
  'NEXT_PUBLIC_GROUP_BANK_NAME',
  'NEXT_PUBLIC_GROUP_BANK_ACCOUNT',
  'NEXT_PUBLIC_GROUP_BANK_BRANCH',
]

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ live: boolean, mockGateway: boolean, missing: string[], checked: string[] }}
 */
export function preflight(env) {
  // The platform's answer first, and unconditionally. This duplicated
  // `isLiveDeployment` — including its defect, where a hand-set DEPLOY_ENV
  // short-circuited and VERCEL_ENV was never read. That is how production came
  // to believe it was not live while serving real members, and this copy would
  // have gone on agreeing with the mistake and reporting nothing missing.
  const live =
    env.VERCEL_ENV === 'production'
      ? true
      : env.DEPLOY_ENV
        ? env.DEPLOY_ENV === 'production'
        : env.VERCEL_ENV
          ? false
          : env.NODE_ENV === 'production'

  const mockGateway = env.PAYMENT_GATEWAY === 'mock'
  // The same question lib/env.ts and integrations/payment both ask.
  const netcashInUse = !mockGateway && Boolean(env.NETCASH_SERVICE_KEY)

  const checked = [
    ...REQUIRED_WHEN_LIVE,
    ...CONFIGURED_WHEN_LIVE,
    ...(mockGateway ? [] : NETCASH_CREDENTIALS),
    ...(netcashInUse ? NETCASH_CONFIG : []),
  ]

  const missing = checked.filter((name) => {
    const value = env[name]
    return value === undefined || value === ''
  })

  const watchdogMissing = WATCHDOG_VARS.filter((name) => {
    const value = env[name]
    return value === undefined || value === ''
  })

  const groupAccountMissing = GROUP_ACCOUNT_VARS.filter((name) => {
    const value = env[name]
    return value === undefined || value === ''
  })

  return { live, mockGateway, missing, checked, watchdogMissing, groupAccountMissing }
}

const log = (msg) => console.log(`[go-live] ${msg}`)

function main() {
  // Only meaningful where the real production variables exist. A local or CI
  // build has none of them and would report everything missing, which is noise.
  if (!process.env.VERCEL || process.env.VERCEL_ENV !== 'production') return 0

  const { live, mockGateway, missing, checked, watchdogMissing, groupAccountMissing } =
    preflight(process.env)

  log(`deployment is ${live ? 'LIVE' : 'NOT live'}; payment gateway is ${mockGateway ? 'mock' : 'real'}`)

  // Said before the pass/fail line below, so it is not swallowed by an
  // "everything is set" that is about a different question.
  // Two different severities, because they are two different problems. Without
  // BACKUP_REPO the watch cannot run at all and degrades to "cannot confirm" —
  // the failure that let a week of failed backups go unreported. Without the
  // token it still works against a public repository; it is only rate-limited.
  if (watchdogMissing.includes('BACKUP_REPO')) {
    log('WARNING: the off-platform backup cannot be watched — BACKUP_REPO is not set.')
    log('  backup-watch will report "cannot confirm" rather than "backup has stopped".')
    log('  See docs/backup-and-restore.md section 3b-ii.')
  }
  if (watchdogMissing.includes('BACKUP_WATCH_TOKEN')) {
    log('note: BACKUP_WATCH_TOKEN is not set. The watch still works on a public')
    log('  repository; unauthenticated GitHub calls are rate-limited per IP, so a')
    log('  busy hour can turn a real answer into "cannot confirm".')
  }

  // Not a failure: the defaults are a real account and members can pay into it.
  // Reported because the cost of not knowing is only paid on the day the account
  // has to change, and on that day it is a code change and a deploy.
  if (groupAccountMissing.length === GROUP_ACCOUNT_VARS.length) {
    log('note: the group collection account is not configured; the built-in')
    log('  details are being shown to members. Changing banks currently means')
    log('  editing lib/group-account.ts and redeploying. See DEPLOYMENT.md,')
    log('  "The group collection account".')
  } else if (groupAccountMissing.length > 0) {
    log('WARNING: the group collection account is only PARTLY configured:')
    for (const name of groupAccountMissing) log(`  falling back to the built-in value: ${name}`)
    log('  Members would be shown a mix of configured and built-in banking')
    log('  details. Set all four together, or none.')
  }

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
