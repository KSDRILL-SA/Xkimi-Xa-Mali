import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * The Netcash credentials are required only in a production build talking to
 * the real gateway. Validation runs at module load, so each case needs a fresh
 * module registry with the environment already in place.
 */

/**
 * Both payment adapters stubbed, for the last case in this file only.
 *
 * Every other case here re-imports `@/lib/env`, which is cheap. "is not a way to
 * deploy without them" re-imports `@/integrations/payment`, and the real
 * `netcash.adapter` drags in `@/lib/netcash` and from there the SOAP client, the
 * batch-file builder, the method table and the retry helper — after a
 * `resetModules()`, so none of it is cached.
 *
 * That one cold load, on a four-core machine with the rest of the suite
 * competing, is what timed this test out at 30s. It was never asserting the
 * wrong value; it never got an answer at all.
 *
 * Safe to stub because the case asserts that the module *throws* while loading.
 * That decision is made in `payment/index.ts` from the environment alone, and
 * the adapters are only ever compared by identity, never called.
 */
vi.mock('@/integrations/payment/netcash.adapter', () => ({
  netcashGateway: { __stub: 'netcash' },
}))
vi.mock('@/integrations/payment/mock.adapter', () => ({
  mockGateway: { __stub: 'mock' },
}))

// Everything lib/env demands on a live deployment *apart from* the Netcash
// credentials, so a failure in these tests is always about those and never about
// missing scaffolding. Kept complete deliberately: if a new live-required
// variable is added and this list is not updated, these tests fail loudly rather
// than passing for the wrong reason.
const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_SECRET: 'a'.repeat(32),
  ENCRYPTION_KEY: '0'.repeat(64),
  WHATSAPP_GROUP_LINK: 'https://chat.whatsapp.com/test',
  NEXTAUTH_URL: 'https://app.example.invalid',
  BULKSMS_USERNAME: 'sms-user',
  BULKSMS_PASSWORD: 'sms-pass',
  RESEND_API_KEY: 'resend-key',
  RESEND_FROM_EMAIL: 'noreply@example.invalid',
  INNGEST_EVENT_KEY: 'inngest-event',
  INNGEST_SIGNING_KEY: 'inngest-signing',
  UPSTASH_REDIS_REST_URL: 'https://redis.example.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'redis-token',
  BLOB_READ_WRITE_TOKEN: 'blob-token',
  ADMIN_API_SECRET: 'b'.repeat(32),
  NETCASH_API_URL: 'https://netcash.example.invalid',
  // A live DebiCheck deploy needs the mandate template as much as it needs
  // the service key — a wrong or absent one is rejected with code 325.
  NETCASH_DEBICHECK_TEMPLATE_ID: 'NCDCT000000001',
  ADMIN_WHATSAPP_NUMBER: '27000000000',
  SUPPORT_EMAIL: 'support@example.invalid',
  NEXT_PUBLIC_ADMIN_URL: 'https://admin.example.invalid',
  NEXT_PUBLIC_SITE_URL: 'https://example.invalid',
}

const NETCASH_ENV = {
  NETCASH_SERVICE_KEY: 'service-key',
  NETCASH_WEBHOOK_SECRET: 'webhook-secret',
}

// Every variable that can change the outcome, cleared before each case is set
// up. The ambient environment is not neutral — CI sets DEPLOY_ENV, the Netcash
// keys and several others at job level — so without this a test could pass or
// fail for a reason that has nothing to do with what it claims to check.
const CONTROLLED = [
  ...Object.keys(BASE_ENV),
  'NETCASH_SERVICE_KEY',
  'NETCASH_WEBHOOK_SECRET',
  'NETCASH_DEBICHECK_TEMPLATE_ID',
  'NEXTAUTH_SECRET',
  'PAYMENT_GATEWAY',
  'DEPLOY_ENV',
  'VERCEL_ENV',
  'NODE_ENV',
]

function applyEnv(vars: Record<string, string | undefined>) {
  // stubEnv mutates keys in place and is undone by unstubAllEnvs. Replacing
  // process.env wholesale would leak into any file sharing this worker, and
  // would strip the object of the behaviour Node gives it.
  for (const key of CONTROLLED) vi.stubEnv(key, undefined as unknown as string)
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) vi.stubEnv(key, value)
  }
}

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  applyEnv({ ...BASE_ENV, ...overrides })
  return await import('@/lib/env')
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

/**
 * The from-address is the one email setting that fails *after* a successful
 * deploy. Resend only sends from a domain you have verified, and nobody can
 * verify a shared mailbox provider's — so a wrong value here does not break the
 * build, it stops every notification arriving while the app reports itself
 * healthy. Members find out by not being told their debit failed.
 */
describe('an address Resend will never send from', () => {
  it('fails the live build rather than the first send', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', DEPLOY_ENV: 'production', ...NETCASH_ENV, RESEND_FROM_EMAIL: 'xkimixamali@gmail.com' }),
    ).rejects.toThrow()
  })

  it('rejects the other shared mailbox providers too', async () => {
    for (const address of ['a@outlook.com', 'a@yahoo.com', 'a@icloud.com', 'a@hotmail.com']) {
      await expect(
        loadEnv({ NODE_ENV: 'production', DEPLOY_ENV: 'production', ...NETCASH_ENV, RESEND_FROM_EMAIL: address }),
      ).rejects.toThrow()
    }
  })

  it('accepts an address on a domain we could verify', async () => {
    const mod = await loadEnv({
      NODE_ENV: 'production', DEPLOY_ENV: 'production', ...NETCASH_ENV,
      RESEND_FROM_EMAIL: 'noreply@xkimixamali.co.za',
    })
    expect(mod.env.RESEND_FROM_EMAIL).toBe('noreply@xkimixamali.co.za')
  })

  it('still rejects something that is not an address at all', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', DEPLOY_ENV: 'production', ...NETCASH_ENV, RESEND_FROM_EMAIL: 'not-an-email' }),
    ).rejects.toThrow()
  })
})

describe('Netcash credentials outside production', () => {
  it('are optional in development, so a local run needs no real keys', async () => {
    const mod = await loadEnv({ NODE_ENV: 'development' })
    expect(mod.env.NETCASH_SERVICE_KEY).toBeUndefined()
    expect(mod.env.NETCASH_WEBHOOK_SECRET).toBeUndefined()
  })

  it('are optional under test', async () => {
    const mod = await loadEnv({ NODE_ENV: 'test' })
    expect(mod.env.NETCASH_SERVICE_KEY).toBeUndefined()
  })

  it('are still read when they are supplied', async () => {
    const mod = await loadEnv({ NODE_ENV: 'development', ...NETCASH_ENV })
    expect(mod.env.NETCASH_SERVICE_KEY).toBe('service-key')
    expect(mod.env.NETCASH_WEBHOOK_SECRET).toBe('webhook-secret')
  })
})

describe('Netcash credentials in a production deploy', () => {
  // Both faults are invisible until money is already moving — an uncollected
  // debit run, or debits that collect while every webhook is rejected and
  // nothing is recorded. Refusing to build is the only point at which the fix
  // is still cheap.
  it('refuses to build without the service key', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', NETCASH_WEBHOOK_SECRET: 'webhook-secret' }),
    ).rejects.toThrow(/NETCASH_SERVICE_KEY|Invalid environment variables/i)
  })

  it('refuses to build without the webhook secret', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', NETCASH_SERVICE_KEY: 'service-key' }),
    ).rejects.toThrow(/NETCASH_WEBHOOK_SECRET|Invalid environment variables/i)
  })

  it('refuses an empty string, not only an absent variable', async () => {
    // An unset Vercel variable arrives as '' rather than undefined, which is the
    // likelier way to get this wrong than omitting it outright.
    await expect(
      loadEnv({ NODE_ENV: 'production', ...NETCASH_ENV, NETCASH_SERVICE_KEY: '' }),
    ).rejects.toThrow(/NETCASH_SERVICE_KEY|Invalid environment variables/i)
  })

  it('builds once both are set', async () => {
    const mod = await loadEnv({ NODE_ENV: 'production', ...NETCASH_ENV })
    expect(mod.env.NETCASH_SERVICE_KEY).toBe('service-key')
    expect(mod.env.NETCASH_WEBHOOK_SECRET).toBe('webhook-secret')
  })
})

describe('staging is not production', () => {
  // The whole reason the rule is not NODE_ENV: Vercel builds preview and staging
  // deploys with NODE_ENV=production too. Keying on it meant staging demanded
  // the same credentials as production — so a staging environment could not
  // exist until the production credentials did, which is backwards.
  it('lets a preview deploy build without Netcash credentials', async () => {
    const mod = await loadEnv({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })
    expect(mod.env.NETCASH_SERVICE_KEY).toBeUndefined()
  })

  it('still requires them when VERCEL_ENV says production', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', VERCEL_ENV: 'production' }),
    ).rejects.toThrow(/NETCASH_SERVICE_KEY|Invalid environment variables/i)
  })

  it('treats a production build with no VERCEL_ENV as live', async () => {
    // Off Vercel there is no VERCEL_ENV, so NODE_ENV is the only signal left.
    // Erring towards "live" keeps a self-hosted deploy protected.
    await expect(loadEnv({ NODE_ENV: 'production' })).rejects.toThrow(
      /NETCASH_SERVICE_KEY|Invalid environment variables/i,
    )
  })
})

describe('the mock gateway exemption', () => {
  it('does not require credentials the mock never uses', async () => {
    const mod = await loadEnv({ NODE_ENV: 'development', PAYMENT_GATEWAY: 'mock' })
    expect(mod.env.NETCASH_SERVICE_KEY).toBeUndefined()
  })

  it('is not a way to take payments without them', async () => {
    // The exemption applies in a production build too, and it buys nothing:
    // integrations/payment will not select the mock there. This asserts that
    // second gate still holds, so the exemption cannot quietly become a
    // loophole.
    //
    // The gate used to be a throw at module load and is now the disabled
    // gateway instead — not a softening. A throw would take down statements,
    // invitations and the admin console along with the payment path, for a
    // feature deliberately not in use since the DebiCheck application was
    // declined. What matters is unchanged and asserted directly: the stand-in
    // is not selected, and nothing can report money as collected.
    vi.resetModules()
    applyEnv({ ...BASE_ENV, ...NETCASH_ENV, NODE_ENV: 'production', PAYMENT_GATEWAY: 'mock' })

    const mod = await import('@/integrations/payment')

    expect(mod.IS_MOCK_GATEWAY).toBe(false)
    expect(mod.GATEWAY_CAN_MOVE_MONEY).toBe(false)
    await expect(mod.paymentGateway.submitOnceOffDebit({} as never)).rejects.toThrow()
  })
})
