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
 * A flag that can actually be turned off.
 *
 * `z.coerce.boolean()` is `Boolean(string)`, under which every non-empty string
 * is true — including `"false"`, `"0"` and `"off"`. Flags declared that way can
 * be switched on and never back, by any value anyone would think to write. Two
 * in this file were declared that way and had been unswitchable since they were
 * added.
 *
 * Only the two literal strings are accepted, so a typo (`"ture"`, `"yes"`)
 * fails validation at boot rather than silently selecting the wrong branch —
 * which for a flag is the difference between a config error and a config error
 * you find out about in production.
 */
const booleanFlag = (fallback: boolean) =>
  z
    .enum(['true', 'false'])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true')

/**
 * Required on the live deployment; falls back to an obviously-fake placeholder
 * elsewhere.
 *
 * For values that always need to be *something* for the code to typecheck and
 * run locally. The placeholders are deliberately unusable — `example.invalid`,
 * an all-zero phone number — so that one accidentally reaching a real member is
 * self-evidently wrong rather than plausibly right.
 */
const configuredWhenLive = <T extends z.ZodType<string, z.ZodTypeDef, string>>(
  schema: T,
  devPlaceholder: string,
) => (LIVE ? schema : schema.default(devPlaceholder))

/**
 * Mailbox providers whose domain nobody but the provider can verify.
 *
 * Not an exhaustive list and not meant to be — it catches the mistake somebody
 * actually makes, which is putting the Foundation's own inbox here because it is
 * the address they think of as "our email".
 */
const UNVERIFIABLE_SENDER_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.za', 'outlook.com',
  'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me',
  'protonmail.com', 'zoho.com', 'mail.com', 'gmx.com', 'yandex.com',
]

/**
 * The address members see mail arrive *from*.
 *
 * Resend will only send from a domain you have verified in your Resend account,
 * and a shared mailbox provider's domain cannot be verified by you — Google owns
 * gmail.com, not us. Setting one here does not fail anything at boot: Resend
 * rejects each send at run time, so every notification stops arriving while the
 * app reports itself perfectly healthy. Members find out by not being told their
 * debit failed.
 *
 * So it is rejected at config validation instead, where it costs a deploy rather
 * than a month of silence. The Foundation's mailbox belongs in `SUPPORT_EMAIL`
 * and `ALERT_FALLBACK_EMAIL`, which *receive*; this one has to be on a domain we
 * control, e.g. `noreply@<our-domain>`.
 */
const sendableFromAddress = () =>
  z
    .string()
    .email()
    .refine(
      (value) => {
        const domain = value.split('@')[1]?.toLowerCase()
        return !!domain && !UNVERIFIABLE_SENDER_DOMAINS.includes(domain)
      },
      {
        message:
          'must be on a domain you can verify in Resend. A shared mailbox provider ' +
          '(gmail.com and the like) cannot be verified by you, so every send is ' +
          'rejected at run time and notifications stop silently. Use noreply@<your-domain>. ' +
          'The Foundation mailbox belongs in SUPPORT_EMAIL and ALERT_FALLBACK_EMAIL, which receive.',
      },
    )

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
    // The key new ciphertext is written under. Rotating it is a three-step
    // operation, not an edit — see `docs/runbook.md`, "Rotating the encryption
    // key". Replacing this value on its own, without moving the old key to
    // ENCRYPTION_PREVIOUS_KEYS first, makes every stored bank and ID number
    // unreadable.
    ENCRYPTION_KEY: z.string().length(64),
    // Stamped into every value written from now on, so a row can be attributed
    // to a key without trying keys against it. Bump it — 1 → 2 — as part of a
    // rotation; leave it alone otherwise.
    ENCRYPTION_KEY_ID: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,32}$/, 'must be 1-32 characters of A-Z, a-z, 0-9, _ or -')
      .default('1'),
    // Retired keys, `id:hex` comma separated, used for reading only. A key
    // stays here until the re-encrypt backfill reports zero rows left under it;
    // removing it earlier is what turns a rotation into data loss.
    ENCRYPTION_PREVIOUS_KEYS: z.string().min(1).optional(),
    NETCASH_SERVICE_KEY: netcashCredential(),
    NETCASH_WEBHOOK_SECRET: netcashCredential(),
    // No default. It used to fall back to the TEST endpoint, so forgetting it in
    // production meant every debit was submitted to a gateway that moves no
    // money — with nothing in the logs to say so.
    NETCASH_API_URL: configuredWhenLive(
      z.string().url(),
      // The NIWS NIF endpoint, per the live WSDL. The previous default pointed
      // at NSWSSX/NetcashTest.asmx — a different, older service that does not
      // expose any DebiCheck method, so every call would have 404'd or been
      // silently accepted by the wrong contract.
      'https://ws.netcash.co.za/NIWS/NIWS_NIF.svc',
    ),
    // Netcash publishes a default software vendor key for integrators without
    // an Independent Software Vendor agreement, and lib/netcash/batch-file.ts
    // carries it. Set this only once Netcash issues a vendor-specific GUID —
    // an ISV agreement is NOT a prerequisite for going live.
    NETCASH_SOFTWARE_VENDOR_KEY: z.string().min(1).optional(),
    // The DebiCheck mandate template (e.g. NCDCT000000001), issued by Netcash
    // with the account. No default is possible: it identifies the collection
    // terms the debtor's bank shows them, and a wrong one is either rejected
    // (325, non-real-time template) or authorises the wrong agreement.
    NETCASH_DEBICHECK_TEMPLATE_ID: requiredWhenLive(z.string().min(1)),
    // Netcash's webhook source IPs. Defaulted in lib/netcash.ts; set this only if
    // Netcash tells you the range has changed. Wrong values reject every callback.
    NETCASH_WEBHOOK_IPS: z.string().min(1).optional(),
    // Without these the SMS provider is silently unreachable and every reminder,
    // debit warning and mandate notice is dropped.
    BULKSMS_USERNAME: requiredWhenLive(z.string().min(1)),
    BULKSMS_PASSWORD: requiredWhenLive(z.string().min(1)),
    RESEND_API_KEY: requiredWhenLive(z.string().min(1)),
    RESEND_FROM_EMAIL: configuredWhenLive(sendableFromAddress(), 'noreply@example.invalid'),
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
    // NOT `z.coerce.boolean()`. That is `Boolean(string)`, under which every
    // non-empty string is true — so `ENABLE_MANUAL_PAYMENTS=false` parsed as
    // **true** and neither of these could be switched off by any value anyone
    // would think to write. They read as feature flags and behaved as
    // constants.
    //
    // `booleanFlag` accepts only the two strings, so a typo fails validation at
    // boot rather than silently selecting the wrong branch.
    ENABLE_MANUAL_PAYMENTS: booleanFlag(true),
    ENABLE_GOAL_LOCKING: booleanFlag(true),
    // Watching the off-platform backup from outside GitHub.
    //
    // The backup workflow alerts when a run fails. It cannot alert when no run
    // happens at all, and GitHub disables scheduled workflows after roughly 60
    // days without repository activity — so a stable, finished app is exactly
    // the case where backups stop silently. The check therefore has to live
    // somewhere that keeps running regardless of GitHub, which is this app.
    //
    // Optional everywhere, including production: without a token the check
    // reports that it cannot see, rather than failing the boot. A repository
    // read-only fine-grained token is enough — see docs/backup-and-restore.md.
    BACKUP_REPO: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'expected "owner/repo"').optional(),
    BACKUP_WATCH_TOKEN: z.string().optional(),
    // Sentry (build-time source-map upload; optional in dev)
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    SENTRY_DSN: z.string().url().optional(),
    // Security tunables — allows per-environment adjustment without code changes
    MAX_LOGIN_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
    LOCKOUT_DURATION_MINUTES: z.coerce.number().int().min(5).max(1440).default(15),
    // See `booleanFlag`. Off by default.
    // Require every account whose password predates the twelve-character policy
    // to reset before signing in again.
    //
    // Off by default, and turning it on is an owner decision taken *after* the
    // founders have been told — not a consequence of deploying this code. On,
    // it signs out every account created under the old eight-character rule,
    // including the single admin's, and the only way back in is an email.
    //
    // For this one the coercion bug would have meant a lockout no env edit
    // could undo.
    REQUIRE_PASSWORD_POLICY_RESET: booleanFlag(false),
    // Shared secret for internal admin→web API calls (server-to-server, no
    // session needed). Missing on the live deployment, every admin action that
    // reaches through to the member app fails authentication.
    ADMIN_API_SECRET: requiredWhenLive(z.string().min(32)),
    // A standing address for critical operational alerts, independent of any
    // user account. Every other alert channel routes through an ACTIVE admin's
    // `User` row and the notification queue; with a single admin, that chain has
    // no spare link. This one is sent directly — if the queue is what broke,
    // queueing the alert about it is not a plan. Optional: unset, alerting
    // behaves exactly as it did before. See `services/alert.service.ts`.
    ALERT_FALLBACK_EMAIL: z.string().email().optional(),
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
    ENCRYPTION_KEY_ID: process.env.ENCRYPTION_KEY_ID,
    ENCRYPTION_PREVIOUS_KEYS: process.env.ENCRYPTION_PREVIOUS_KEYS,
    NETCASH_SERVICE_KEY: process.env.NETCASH_SERVICE_KEY,
    NETCASH_WEBHOOK_SECRET: process.env.NETCASH_WEBHOOK_SECRET,
    NETCASH_API_URL: process.env.NETCASH_API_URL,
    NETCASH_SOFTWARE_VENDOR_KEY: process.env.NETCASH_SOFTWARE_VENDOR_KEY,
    NETCASH_DEBICHECK_TEMPLATE_ID: process.env.NETCASH_DEBICHECK_TEMPLATE_ID,
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
    BACKUP_REPO: process.env.BACKUP_REPO,
    BACKUP_WATCH_TOKEN: process.env.BACKUP_WATCH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_DSN: process.env.SENTRY_DSN,
    MAX_LOGIN_ATTEMPTS: process.env.MAX_LOGIN_ATTEMPTS,
    LOCKOUT_DURATION_MINUTES: process.env.LOCKOUT_DURATION_MINUTES,
    REQUIRE_PASSWORD_POLICY_RESET: process.env.REQUIRE_PASSWORD_POLICY_RESET,
    ADMIN_API_SECRET: process.env.ADMIN_API_SECRET,
    ALERT_FALLBACK_EMAIL: process.env.ALERT_FALLBACK_EMAIL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
})
