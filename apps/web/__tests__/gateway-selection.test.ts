import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The real adapter validates the environment at import time; this test is about
// which gateway gets chosen, not about env loading.
vi.mock('@/lib/env', () => ({
  env: {
    NETCASH_API_URL: 'https://netcash.test',
    NETCASH_DEBICHECK_TEMPLATE_ID: 'NCDCT000000001',
    NETCASH_SERVICE_KEY: 'k',
    NETCASH_WEBHOOK_SECRET: 's',
    ENCRYPTION_KEY: '0'.repeat(64),
  },
}))

/**
 * Both adapters stubbed, and this is what stops the file timing out.
 *
 * `selectGateway` uses these two only as identities — it returns one of them and
 * `IS_MOCK_GATEWAY` is a `===` against `mockGateway`. It never calls a method on
 * either. But importing the real `netcash.adapter` drags in `@/lib/netcash` and
 * from there the SOAP client, the batch-file builder, the method table and the
 * retry helper.
 *
 * Every case below calls `loadGateway`, which does `vi.resetModules()` and then
 * re-imports — so that whole chain was being re-resolved and re-evaluated nine
 * times in this one file. On a four-core machine, with the rest of the suite
 * competing for those cores, nine cold loads of it is what pushed this past the
 * 30s timeout: the failures were never wrong answers, they were `Test timed out
 * in 30000ms`.
 *
 * Stubbing the two adapters leaves `index.ts` — the module actually under test —
 * as the only thing being re-evaluated, and the identity comparison still means
 * exactly what it meant.
 */
vi.mock('@/integrations/payment/netcash.adapter', () => ({
  netcashGateway: { __stub: 'netcash' },
}))
vi.mock('@/integrations/payment/mock.adapter', () => ({
  mockGateway: { __stub: 'mock' },
}))

/**
 * Every variable that can change the outcome, cleared before each case is set
 * up. DEPLOY_ENV and VERCEL_ENV matter most: they outrank NODE_ENV when deciding
 * whether this is the live deployment, and both are set in environments these
 * tests run in — CI sets DEPLOY_ENV at job level. Leaving either in place would
 * quietly turn every "in production" case below into a non-production one.
 */
const CONTROLLED = ['PAYMENT_GATEWAY', 'NODE_ENV', 'DEPLOY_ENV', 'VERCEL_ENV', 'NETCASH_SERVICE_KEY']

/**
 * Selection happens at module load, so each case needs a fresh module registry
 * with the environment already in place.
 *
 * `vi.stubEnv` rather than assigning to `process.env`, and this is not a style
 * preference. Vitest reuses a worker thread across test files. Replacing
 * `process.env` with a plain object detaches it from the one every other file's
 * stubs hold a reference to, so their `unstubAllEnvs` restores onto an object
 * nobody reads any more and their environment leaks into whatever runs next in
 * that worker. This file used to do exactly that, and it is why it,
 * `env-netcash` and `whatsapp.preferences` failed together at random under load
 * — roughly one full-suite run in four, passing on every re-run and standalone.
 * `env-netcash` already carried a comment warning against it.
 */
async function loadGateway(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const key of CONTROLLED) vi.stubEnv(key, undefined as unknown as string)
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) vi.stubEnv(key, value)
  }
  return await import('@/integrations/payment')
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('choosing a payment gateway', () => {
  it('uses the real gateway when nothing is set', async () => {
    const mod = await loadGateway({
      PAYMENT_GATEWAY: undefined, NODE_ENV: 'development', NETCASH_SERVICE_KEY: 'stub-key',
    })
    expect(mod.IS_MOCK_GATEWAY).toBe(false)
  })

  it('uses the real gateway for any value other than the exact opt-in', async () => {
    // No fuzzy matching: a typo must not silently disable real payments.
    for (const value of ['MOCK', 'mocked', 'true', '1', 'netcash', '']) {
      const mod = await loadGateway({
        PAYMENT_GATEWAY: value, NODE_ENV: 'development', NETCASH_SERVICE_KEY: 'stub-key',
      })
      expect(mod.IS_MOCK_GATEWAY, `PAYMENT_GATEWAY=${value}`).toBe(false)
    }
  })

  it('uses the stand-in when explicitly asked, outside production', async () => {
    const mod = await loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'development' })
    expect(mod.IS_MOCK_GATEWAY).toBe(true)
  })

  it('uses the stand-in under test', async () => {
    const mod = await loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'test' })
    expect(mod.IS_MOCK_GATEWAY).toBe(true)
  })
})

describe('the mock can never run on a live deployment', () => {
  // A mock gateway serving real members reports every debit as collected while
  // no money moves: contributions marked paid, a pool balance that does not
  // exist, and the members finding out at the worst possible moment.
  //
  // This used to be a throw at module load. It is now the disabled gateway
  // instead, and the change is not a softening — see below.
  it('selects the disabled gateway rather than the stand-in', async () => {
    const mod = await loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'production' })

    expect(mod.IS_MOCK_GATEWAY).toBe(false)
    expect(mod.GATEWAY_CAN_MOVE_MONEY).toBe(false)
  })

  it('refuses every money operation, rather than answering SUCCESS', async () => {
    // The single behaviour that matters. The stand-in returns
    // { status: 'SUCCESS' } for any debit, which is how a R100 payment came to
    // be written as settled with no bank contacted.
    const mod = await loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'production' })

    await expect(
      mod.paymentGateway.submitOnceOffDebit({} as never),
    ).rejects.toThrow(/not available|no active payment provider/i)
  })

  it('stays up, because everything else still has members to serve', async () => {
    // Why this is no longer a throw. Refusing to boot would take down
    // statements, invitations, the community board and the admin console along
    // with the payment path — for a feature deliberately not in use, since the
    // DebiCheck application was declined and there are no credentials to be
    // had. A gateway that is present and refuses is the honest state.
    await expect(
      loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'production' }),
    ).resolves.toBeDefined()
  })

  it('still starts normally in production with real credentials', async () => {
    const mod = await loadGateway({
      PAYMENT_GATEWAY: undefined, NODE_ENV: 'production', NETCASH_SERVICE_KEY: 'stub-key',
    })
    expect(mod.IS_MOCK_GATEWAY).toBe(false)
    expect(mod.GATEWAY_CAN_MOVE_MONEY).toBe(true)
  })
})

describe('a declared environment cannot outrank the platform', () => {
  /**
   * The defect that let it happen, and the reason it is tested here rather than
   * only in the deployment helper.
   *
   * `isLiveDeployment()` read DEPLOY_ENV first and short-circuited on it, so any
   * value other than "production" answered the question outright and VERCEL_ENV
   * — which Vercel sets itself, and only for the deployment serving the
   * production domain — was never read.
   *
   * Production ran with DEPLOY_ENV set to a non-live value. So the app believed
   * it was not live, the guard above never fired, the stand-in was selected on
   * the real site, and a member's R100 was recorded as a settled payment
   * against a bank that had never been contacted.
   *
   * A declaration may make a deployment stricter. It must never make it looser.
   */
  it('treats VERCEL_ENV=production as live even when DEPLOY_ENV disagrees', async () => {
    const mod = await loadGateway({
      PAYMENT_GATEWAY: 'mock',
      DEPLOY_ENV: 'staging',
      VERCEL_ENV: 'production',
    })

    // The exact configuration that was live. Before the fix this returned the
    // stand-in and answered SUCCESS to everything.
    expect(mod.IS_MOCK_GATEWAY).toBe(false)
    expect(mod.GATEWAY_CAN_MOVE_MONEY).toBe(false)
  })

  it('still lets a declaration make a preview stricter', async () => {
    // The direction that remains allowed: claiming live on a preview, to
    // rehearse production rules. Only loosening is refused.
    const mod = await loadGateway({
      PAYMENT_GATEWAY: 'mock',
      DEPLOY_ENV: 'production',
      VERCEL_ENV: 'preview',
    })

    expect(mod.IS_MOCK_GATEWAY).toBe(false)
  })

  it('leaves genuine preview and development deployments alone', async () => {
    for (const vercelEnv of ['preview', 'development']) {
      const mod = await loadGateway({ PAYMENT_GATEWAY: 'mock', VERCEL_ENV: vercelEnv })
      expect(mod.IS_MOCK_GATEWAY, `VERCEL_ENV=${vercelEnv}`).toBe(true)
    }
  })
})

describe('the real gateway can never be selected with no service key', () => {
  // Found while auditing for go-live readiness: `lib/env.ts` only requires
  // NETCASH_SERVICE_KEY when `isLiveDeployment()` is true, so a deployment that
  // did not believe it was live could select the real gateway with nothing
  // configured — and the first failure would be a throw deep inside
  // `lib/netcash.ts` on an actual debit submission, on debit night.
  it('refuses to start rather than selecting a gateway it cannot use', async () => {
    await expect(
      loadGateway({ PAYMENT_GATEWAY: undefined, NODE_ENV: 'development', NETCASH_SERVICE_KEY: undefined }),
    ).rejects.toThrow(/NETCASH_SERVICE_KEY/)
  })

  it('says why, and how to fix it', async () => {
    await expect(
      loadGateway({ PAYMENT_GATEWAY: undefined, NODE_ENV: 'development', NETCASH_SERVICE_KEY: undefined }),
    ).rejects.toThrow(/every debit submission would throw|PAYMENT_GATEWAY=mock/)
  })

  it('disables payments rather than throwing when the deployment is live', async () => {
    // Same misconfiguration, different answer, and deliberately so. On a
    // developer's machine a throw is the fastest way to hear about it; on the
    // live site it would take down every other feature for a payment path that
    // was never going to work anyway.
    const mod = await loadGateway({
      PAYMENT_GATEWAY: undefined, VERCEL_ENV: 'production', NETCASH_SERVICE_KEY: undefined,
    })

    expect(mod.GATEWAY_CAN_MOVE_MONEY).toBe(false)
    await expect(mod.paymentGateway.submitOnceOffDebit({} as never)).rejects.toThrow()
  })

  it('does not affect the mock gateway, which needs no credentials', async () => {
    const mod = await loadGateway({
      PAYMENT_GATEWAY: 'mock', NODE_ENV: 'development', NETCASH_SERVICE_KEY: undefined,
    })
    expect(mod.IS_MOCK_GATEWAY).toBe(true)
  })
})
