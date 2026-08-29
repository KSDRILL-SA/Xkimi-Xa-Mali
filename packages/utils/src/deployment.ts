/**
 * Which deployment this process is, for config that must be strict in
 * production and forgiving everywhere else.
 *
 * The distinction matters because `NODE_ENV` cannot make it. Next sets
 * NODE_ENV=production for every optimised build — preview deploys, CI builds and
 * a developer running `next build` to check their work all included — so it
 * answers "is this an optimised build", not "is this live". Keying
 * production-only rules on it makes a staging deploy demand the same credentials
 * as production, and turns a local compile check into a hunt for a dozen
 * production secrets.
 *
 * Resolution order, most explicit first:
 *
 *   1. `DEPLOY_ENV` — set it deliberately. `production` means live; anything
 *      else means not. This is the escape hatch for CI and for local builds.
 *   2. `VERCEL_ENV` — set automatically by Vercel to "production" | "preview" |
 *      "development". Only the first serves real members and moves real money.
 *   3. `NODE_ENV` — the last resort, off Vercel with nothing declared. Treating a
 *      production build as live keeps a self-hosted deploy protected, which is
 *      the safe direction to be wrong in.
 *
 * Only the exact string "production" counts at each step, so a typo fails
 * towards the safe answer rather than silently unlocking a live deployment.
 */
export function isLiveDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  const deployEnv = env.DEPLOY_ENV
  if (deployEnv) return deployEnv === 'production'

  const vercelEnv = env.VERCEL_ENV
  if (vercelEnv) return vercelEnv === 'production'

  return env.NODE_ENV === 'production'
}

/**
 * True on a deployment that is not the live one — staging, preview, CI, local
 * dev, tests. The place where stand-ins and absent credentials are acceptable.
 */
export function isNonLiveDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return !isLiveDeployment(env)
}

/**
 * A human-readable label for which deployment this is, for tagging
 * observability data (Sentry's `environment` field and similar) — not for
 * branching logic, which should use `isLiveDeployment` instead.
 *
 * Same resolution order as `isLiveDeployment`, but returns the actual value
 * rather than collapsing it to a boolean, so a staging or preview deploy's
 * errors show up labelled as such instead of merging into "production" the
 * way a bare `NODE_ENV` tag would (Next sets NODE_ENV=production for every
 * optimised build, preview included).
 */
export function deploymentEnvironmentName(env: NodeJS.ProcessEnv = process.env): string {
  return env.DEPLOY_ENV ?? env.VERCEL_ENV ?? env.NODE_ENV ?? 'unknown'
}
