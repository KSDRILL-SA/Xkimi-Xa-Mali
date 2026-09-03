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
 * Resolution order:
 *
 *   1. `VERCEL_ENV === "production"` — the platform's own answer, and it
 *      outranks everything. Vercel sets this itself, and only for the
 *      deployment serving the production domain: real members, real money.
 *   2. `DEPLOY_ENV` — declared by hand. It can make a deployment stricter
 *      (claim live on a preview, to rehearse production rules) but it can no
 *      longer make one looser. This is still the escape hatch for CI and for
 *      local builds, neither of which has VERCEL_ENV=production.
 *   3. `VERCEL_ENV` for anything else — preview and development are not live.
 *   4. `NODE_ENV` — the last resort, off Vercel with nothing declared. Treating
 *      a production build as live keeps a self-hosted deploy protected, which
 *      is the safe direction to be wrong in.
 *
 * ── Why the platform outranks the declaration ──────────────────────────────
 *
 * DEPLOY_ENV used to be checked first and to short-circuit, so any value other
 * than "production" answered the question outright and VERCEL_ENV was never
 * read. That let a hand-set variable tell the app that a deployment serving
 * real members on the real domain was not live — and everything that keeps this
 * system honest hangs off this one boolean.
 *
 * It was not hypothetical. Production ran with DEPLOY_ENV set to a non-live
 * value, so `isLiveDeployment()` returned false, so the guard in
 * integrations/payment that refuses the mock gateway on a live deployment never
 * fired. The stand-in was selected in production and answered SUCCESS to every
 * debit. A member paid R100 in the app; a settled transaction was written, the
 * pool was credited and the contribution was marked paid, and no bank had been
 * contacted at all.
 *
 * A declaration may tighten what the platform says. It must never loosen it.
 *
 * Only the exact string "production" counts at each step, so a typo fails
 * towards the safe answer rather than silently unlocking a live deployment.
 */
export function isLiveDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  // First, and unconditional. Nothing a person can set may contradict it.
  if (env.VERCEL_ENV === 'production') return true

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

/**
 * Whether Vercel Blob can be reached from this process.
 *
 * Not "is BLOB_READ_WRITE_TOKEN set", which is what four separate call sites
 * used to ask and what `lib/env.ts` used to demand on a live deployment.
 *
 * A Blob store connected to a Vercel project authenticates by **OIDC** —
 * `@vercel/blob` v2 asks `@vercel/oidc` for a token and only falls back to a
 * read-write token if one is configured. Vercel's own dashboard recommends
 * revoking the read-write token when the store is only used from Vercel, so its
 * absence is the *recommended* state, not a misconfiguration.
 *
 * Keying on the token therefore got it backwards in the one place it mattered.
 * A correctly configured production deployment has no token, so every uploader
 * concluded there was "nowhere to put bytes" and fell back to a base64 `data:`
 * URL — a whole file inlined into a database column. For a proof of payment
 * that also fails validation outright, because the column is capped at 1024
 * characters, so the feature would have refused every upload while blob storage
 * sat there working.
 *
 * `VERCEL_OIDC_TOKEN` is not checked directly: at runtime the token usually
 * arrives per request in an `x-vercel-oidc-token` header rather than the
 * environment, so it is absent from `process.env` exactly when it is working.
 * Running on Vercel at all is the honest signal, and it is the one thing that
 * distinguishes "a store is attached to this deployment" from "a developer's
 * laptop with no cloud storage".
 */
export function isBlobStorageAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN) || env.VERCEL === '1'
}
