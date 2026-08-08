import { z } from 'zod'
import { isLiveDeployment } from '@xxm/utils/deployment'

/**
 * Strict on the live deployment, forgiving everywhere else. See
 * `@xxm/utils/deployment` for why this is not `NODE_ENV === 'production'` —
 * staging is an optimised build too and has to exist before production
 * credentials do.
 */
const LIVE = isLiveDeployment()

/** Required on the live deployment; optional in development, staging and tests. */
const requiredWhenLive = (schema: z.ZodString) => (LIVE ? schema : schema.optional())

const schema = z.object({
  DATABASE_URL:    z.string().url(),
  AUTH_SECRET:     z.string().min(32),
  NEXTAUTH_URL:    requiredWhenLive(z.string().url()),
  NODE_ENV:        z.enum(['development', 'test', 'production']).default('development'),

  // URL of the web app — used for internal server-to-server API calls. Required
  // on the live deployment: the call sites used to fall back to localhost:3000,
  // so a missing value in production did not fail, it just sent every admin→web
  // request to the serverless function's own loopback, where nothing answers.
  WEB_INTERNAL_URL: requiredWhenLive(z.string().url()),
  // Shared secret for internal admin→web API authentication. Must be identical
  // to the member app's value; without it every internal call is rejected.
  ADMIN_API_SECRET: requiredWhenLive(z.string().min(32)),

  // Public URL of the member portal, linked from the login page. Validated here
  // so a live build fails without it; the client component that renders the link
  // reads process.env directly, because Next inlines NEXT_PUBLIC_* at build time
  // and this module cannot be imported into the browser bundle.
  NEXT_PUBLIC_APP_URL: requiredWhenLive(z.string().url()),

  // Shared with the member app. Required on the live deployment, where an
  // unconfigured limiter is an open door; optional elsewhere, where it degrades
  // to allowing everything through exactly as the member app does.
  UPSTASH_REDIS_REST_URL:   requiredWhenLive(z.string().url()),
  UPSTASH_REDIS_REST_TOKEN: requiredWhenLive(z.string().min(1)),

  MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().int().min(5).max(1440).default(15),

  // Require an account whose password predates the twelve-character policy to
  // replace it before signing in here. Off by default; see the member app's
  // `env.ts` for why this is not `z.coerce.boolean()`.
  REQUIRE_PASSWORD_POLICY_RESET: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),

  // This app sends no email. These are declared, optional, for one purpose: to
  // establish whether a password-reset email could reach anyone before refusing
  // an admin entry over a password policy. The reset itself happens in the
  // member app against the same `User` row.
  //
  // Unset, the requirement is not enforced here. That is the safe default and
  // the deliberate one — the alternative is locking the only admin out of the
  // console with no way back in, over a policy rather than a compromise.
  RESEND_API_KEY:    z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),

  // Server-side DSN, falling back to the public one. Both optional: error
  // reporting is off in development and in any environment that has not been
  // given a DSN, which must not stop the app from booting.
  SENTRY_DSN:             z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN:      z.string().optional(),
  SENTRY_ORG:             z.string().optional(),
  SENTRY_PROJECT:         z.string().optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // console, not the logger: this runs while the module graph is still loading,
  // before instrumentation has initialised Sentry, and the process throws on the
  // next line regardless. Anything cleverer here would just fail silently.
  console.error('❌  Invalid admin environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  throw new Error('Invalid environment configuration')
}

export const env = parsed.data

/**
 * Base URL for server-to-server calls into the member app.
 *
 * One resolution, in one place. Three call sites used to repeat
 * `WEB_INTERNAL_URL ?? NEXTAUTH_URL ?? 'http://localhost:3000'`, which meant a
 * production deploy missing the variable quietly addressed its own loopback
 * instead of failing — admin actions returning errors that looked like the
 * member app was down. On the live deployment `WEB_INTERNAL_URL` is now
 * required, so this only ever falls back off production.
 */
export const WEB_BASE_URL: string =
  env.WEB_INTERNAL_URL ?? env.NEXTAUTH_URL ?? 'http://localhost:3000'
