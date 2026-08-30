/**
 * Applies pending Prisma migrations as part of a production Vercel build.
 *
 * Before this existed, nothing in the pipeline ran `prisma migrate deploy`.
 * All three Vercel projects build with the Next.js default (`next build`), so
 * every schema change had to be applied to production by hand, out of band,
 * by someone remembering to do it. A migration that is committed, reviewed and
 * merged but never run leaves the deployed code expecting columns that are not
 * there — and the failure surfaces at runtime, to a member, as a 500.
 *
 * ── The guard that matters most: preview shares the production database ─────
 *
 * `DATABASE_URL` and `DIRECT_DATABASE_URL` are scoped to **Production and
 * Preview** on this project — the same values for both. Every preview
 * deployment therefore talks to the live database.
 *
 * So a migration step that ran on every build would apply the branch's
 * migrations to production the moment a pull request opened a preview — before
 * review, before merge, and for branches that are never merged at all. That is
 * strictly worse than applying them by hand.
 *
 * Hence the environment gate below. It is the entire reason this is a script
 * and not `prisma migrate deploy &&` inlined into the build command, where the
 * condition would be invisible and easy to drop.
 *
 * ── Only `web` runs this ────────────────────────────────────────────────────
 *
 * It was briefly wired into `admin` as well, on the reasoning that the two
 * deploy as independent Vercel projects against one database in no guaranteed
 * order, so whichever went live first should have applied the schema.
 *
 * That failed the admin production build immediately: the admin project has
 * `DATABASE_URL` but no `DIRECT_DATABASE_URL`, so this script correctly
 * refused to migrate over a pooled connection and exited non-zero. Only `web`
 * is configured with a direct connection, so only `web` can own migrations.
 *
 * The consequence to be aware of: `admin` can go live a few seconds before
 * `web` has applied a migration from the same commit. That window is harmless
 * for additive changes and is the reason to keep migrations additive —
 * add a column, deploy, backfill, and only drop the old one a release later.
 * Giving the admin project a `DIRECT_DATABASE_URL` would close it, and is an
 * environment change rather than a code one.
 *
 * `website` never runs it: it has no Prisma dependency and no database access.
 *
 * ── Failure is deliberately fatal ───────────────────────────────────────────
 *
 * A non-zero exit fails the build, so the deployment does not go live. The
 * alternative — warn and continue — ships code against a schema that was not
 * migrated, which is the exact failure this script exists to prevent.
 */
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Log with a stable prefix so the step is findable in Vercel build logs. */
const log = (msg) => console.log(`[migrate-on-deploy] ${msg}`)

/**
 * The whole decision, as a pure function of the environment.
 *
 * Separated from the side effects so it can be tested. The `preview` branch in
 * particular is the one thing standing between an open pull request and a
 * migrated production database — a guard that is only ever verified by hand is
 * a guard that can be deleted in a refactor with nothing to catch it.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ action: 'skip' | 'fail' | 'migrate', reason: string }}
 */
export function decide(env) {
  // Escape hatch for a build that must not touch the database. Deliberately an
  // explicit opt-out: the safe default is to migrate, and skipping is the
  // unusual choice that should have to be spelled out.
  if (env.SKIP_DEPLOY_MIGRATIONS === '1') {
    return { action: 'skip', reason: 'SKIP_DEPLOY_MIGRATIONS=1 is set' }
  }

  // Local `npm run build` and CI both reach this script through `turbo run
  // build`. Neither should migrate anything: CI has no production credentials
  // it should be using, and a developer building locally is not deploying.
  if (!env.VERCEL) {
    return { action: 'skip', reason: 'not a Vercel build' }
  }

  // Preview and production share a database here, so this comparison is what
  // stops a pull request from migrating production.
  if (env.VERCEL_ENV !== 'production') {
    return { action: 'skip', reason: `VERCEL_ENV is "${env.VERCEL_ENV ?? 'unset'}", not "production"` }
  }

  // Migrations run over the unpooled endpoint: a pooler multiplexes statements
  // across backends, so the advisory lock and session state `migrate` depends
  // on do not survive. Missing here means the production project is
  // misconfigured, which is a reason to stop rather than to guess.
  if (!env.DIRECT_DATABASE_URL) {
    return {
      action: 'fail',
      reason: 'DIRECT_DATABASE_URL is not set — refusing to migrate over the pooled connection.',
    }
  }

  return { action: 'migrate', reason: 'production build with a direct connection' }
}

function main() {
  const decision = decide(process.env)

  if (decision.action === 'skip') {
    log(`skipped — ${decision.reason}`)
    return 0
  }

  if (decision.action === 'fail') {
    console.error(`[migrate-on-deploy] ${decision.reason}`)
    return 1
  }

  log('applying pending migrations to production…')

  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: packageRoot,
    stdio: 'inherit',
    // `npx` resolves through a shell on Windows; harmless on Linux, where
    // Vercel actually builds.
    shell: process.platform === 'win32',
  })

  if (result.error) {
    console.error(`[migrate-on-deploy] failed to start prisma: ${result.error.message}`)
    return 1
  }

  if (result.status !== 0) {
    console.error(`[migrate-on-deploy] prisma migrate deploy exited ${result.status} — failing the build so unmigrated code is not deployed.`)
    return result.status ?? 1
  }

  log('migrations applied.')
  return 0
}

// Importing this module for `decide` must not run a migration, so the side
// effects only happen when it is executed directly as the build step.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main())
}
