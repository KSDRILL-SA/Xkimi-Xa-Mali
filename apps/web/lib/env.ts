import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'
import { isLiveDeployment } from '@xxm/utils/deployment'

/**
 * Config rules are strict on the live deployment and forgiving everywhere else.
 *
 * The point is that every one of these fails *quietly* when it is missing. The
 * app boots, the pages render, and the damage only shows up somewhere no one is
 * looking: a debit run that never fires, a reminder nobody receives, a webhook
 * rejected, a rate limiter waving everything through. Each is discovered days
 * later, from the consequence rather than the cause.
 *
 * So the rules below turn the deploy runbook's "critical / easy to get wrong"
 * list into something the build enforces. A half-configured production deploy
 * stops at build time with the missing names printed, which is the one moment
 * when fixing it costs nothing.
 *
 * `LIVE` is deliberately not `NODE_ENV === 'production'` — see
 * `@xxm/utils/deployment`. Staging is an optimised build too, and must be able
 * to exist before the production credentials do.
 */
const LIVE = isLiveDeployment()

/** Required on the live deployment; optional in development, staging and tests. */
const requiredWhenLive = (schema: z.ZodString) => (LIVE ? schema : schema.optional())

/**
 * Required on the live deployment; falls back to an obviously-fake placeholder
 * elsewhere.
 *
 * For values that always need to be *something* for the code to typecheck and
 * run locally. The placeholders are deliberately unusable — `example.invalid`,
 * an all-zero phone number — so that one accidentally reaching a real member is
 * self-evidently wrong rather than plausibly right.
 */
const configuredWhenLive = (schema: z.ZodString, devPlaceholder: string) =>
  LIVE ? schema : schema.default(devPlaceholder)

/**
 * A Netcash credential. Required on the live deployment, which is the only
 * place that talks to the real gateway.
 *
 * - No `NETCASH_SERVICE_KEY` and every debit submission throws
 *   (`lib/netcash.ts`) — nothing is collected, on debit night.
 * - No `NETCASH_WEBHOOK_SECRET` and `verifyWebhookSignature` returns false for
 *   every callback, so each one is rejected. This is the worse of the two: the
 *   debits still go out and the money still moves, but nothing records it.
 *   Transactions stay pending, contributions stay unpaid, and the ledger
 *   silently disagrees with the bank.
 *
 * The mock gateway is exempt because it needs no credentials. That is not a way
 * around this check: `integrations/payment` refuses to start when the mock is
 * selected on the live deployment, so there is no configuration in which a live
 * deploy runs without these set.
 */
const netcashCredential = () =>
  LIVE && process.env.PAYMENT_GATEWAY !== 'mock'
    ? z.string().min(1)
    : z.string().min(1).optional()

export const env = createEnv({
  emptyStringAsUndefined: true,
  server: {
    DATABASE_URL: z.string().url(),
    // Resolved from AUTH_SECRET (v5 standard) or NEXTAUTH_SECRET (v4 compat) — one must be set.
    AUTH_SECRET: z.string().min(32),
    // Auth callbacks and every absolute URL the app builds resolve against this.
    NEXTAUTH_URL: requiredWhenLive(z.string().url()),
    FOUNDER_EMAIL: z.string().email().optional(),
    ENCRYPTION_KEY: z.string().length(64),
    NETCASH_SERVICE_KEY: netcashCredential(),
    NETCASH_WEBHOOK_SECRET: netcashCredential(),
    // No default. It used to fall back to the TEST endpoint, so forgetting it in
    // production meant every debit was submitted to a gateway that moves no
    // money — with nothing in the logs to say so.
    NETCASH_API_URL: configuredWhenLive(
      z.string().url(),
      'https://ws.netcash.co.za/NSWSSX/NetcashTest.asmx',
    ),
    // Netcash's webhook source IPs. Defaulted in lib/netcash.ts; set this only if
    // Netcash tells you the range has changed. Wrong values reject every callback.
    NETCASH_WEBHOOK_IPS: z.string().min(1).optional(),
    // Without these the SMS provider is silently unreachable and every reminder,
    // debit warning and mandate notice is dropped.
    BULKSMS_USERNAME: requiredWhenLive(z.string().min(1)),
    BULKSMS_PASSWORD: requiredWhenLive(z.string().min(1)),
    RESEND_API_KEY: requiredWhenLive(z.string().min(1)),
    RESEND_FROM_EMAIL: configuredWhenLive(z.string().email(), 'noreply@example.invalid'),
    // No Inngest keys means none of the 16 scheduled jobs fire — including the
    // debit run itself and ledger reconciliation. The app looks perfectly healthy.
    INNGEST_EVENT_KEY: requiredWhenLive(z.string().min(1)),
    INNGEST_SIGNING_KEY: requiredWhenLive(z.string().min(1)),
    // Unconfigured, the rate limiter allows every request through. That degrades
    // quietly by design off production; on it, it is an open door.
    UPSTASH_REDIS_REST_URL: requiredWhenLive(z.string().url()),
    UPSTASH_REDIS_REST_TOKEN: requiredWhenLive(z.string().min(1)),
    // PDF statements and signature storage.
    BLOB_READ_WRITE_TOKEN: requiredWhenLive(z.string().min(1)),
    WHATSAPP_GROUP_LINK: z.string().url(),
    WHATSAPP_GROUP_NAME: z.string().default('Xkimm Xa Mali Foundation'),
    ADMIN_WHATSAPP_NUMBER: configuredWhenLive(z.string().min(1), '27000000000'),
    // Shown to members on the support page as a mailto: link.
    SUPPORT_EMAIL: configuredWhenLive(z.string().email(), 'support@example.invalid'),
    ENABLE_MANUAL_PAYMENTS: z.coerce.boolean().default(true),
    ENABLE_GOAL_LOCKING: z.coerce.boolean().default(true),
    // Sentry (build-time source-map upload; optional in dev)
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    // Security tunables — allows per-environment adjustment without code changes
    MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    LOCKOUT_DURATION_MINUTES: z.coerce.number().int().min(5).max(1440).default(15),
    // Shared secret for internal admin→web API calls (server-to-server, no
    // session needed). Missing on the live deployment, every admin action that
    // reaches through to the member app fails authentication.
    ADMIN_API_SECRET: requiredWhenLive(z.string().min(32)),
  },
  client: {
    NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
    NEXT_PUBLIC_ADMIN_URL: configuredWhenLive(z.string().url(), 'http://localhost:3002'),
    // Public marketing site. Its hostname is printed on every generated PDF.
    NEXT_PUBLIC_SITE_URL: configuredWhenLive(z.string().url(), 'http://localhost:3001'),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    FOUNDER_EMAIL: process.env.FOUNDER_EMAIL,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    NETCASH_SERVICE_KEY: process.env.NETCASH_SERVICE_KEY,
    NETCASH_WEBHOOK_SECRET: process.env.NETCASH_WEBHOOK_SECRET,
    NETCASH_API_URL: process.env.NETCASH_API_URL,
    NETCASH_WEBHOOK_IPS: process.env.NETCASH_WEBHOOK_IPS,
    BULKSMS_USERNAME: process.env.BULKSMS_USERNAME,
    BULKSMS_PASSWORD: process.env.BULKSMS_PASSWORD,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    WHATSAPP_GROUP_LINK: process.env.WHATSAPP_GROUP_LINK,
    WHATSAPP_GROUP_NAME: process.env.WHATSAPP_GROUP_NAME,
    ADMIN_WHATSAPP_NUMBER: process.env.ADMIN_WHATSAPP_NUMBER,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
    ENABLE_MANUAL_PAYMENTS: process.env.ENABLE_MANUAL_PAYMENTS,
    ENABLE_GOAL_LOCKING: process.env.ENABLE_GOAL_LOCKING,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_DSN: process.env.SENTRY_DSN,
    MAX_LOGIN_ATTEMPTS: process.env.MAX_LOGIN_ATTEMPTS,
    LOCKOUT_DURATION_MINUTES: process.env.LOCKOUT_DURATION_MINUTES,
    ADMIN_API_SECRET: process.env.ADMIN_API_SECRET,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
})
