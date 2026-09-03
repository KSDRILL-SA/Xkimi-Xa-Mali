import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — plain .mjs build script, no type declarations
import {
  preflight,
  REQUIRED_WHEN_LIVE,
  CONFIGURED_WHEN_LIVE,
  NETCASH_CREDENTIALS,
  NETCASH_CONFIG,
} from '../scripts/golive-preflight.mjs'

/**
 * The go-live preflight reports which variables are still missing before
 * `DEPLOY_ENV` is switched to `production` — the switch that makes all of them
 * mandatory at once, at the worst possible moment to discover one is absent.
 *
 * A report like that is only worth having if it is complete. If someone adds a
 * variable to `requiredWhenLive` in `lib/env.ts` and forgets to list it in the
 * script, the preflight keeps saying everything is fine and the deployment
 * still fails at boot — which is worse than having no preflight, because now
 * there is something reassuring you.
 *
 * So the lists are not maintained by hand and hoped over: these tests read
 * `lib/env.ts` and fail if the two ever disagree.
 */
const ENV_SOURCE = readFileSync(join(__dirname, '../lib/env.ts'), 'utf8')

function declaredWith(helper: string): string[] {
  const pattern = new RegExp(`^\\s+([A-Z][A-Z0-9_]*):\\s*${helper}\\(`, 'gm')
  return [...ENV_SOURCE.matchAll(pattern)].map((m) => m[1]).sort()
}

describe('go-live preflight — lists match lib/env.ts', () => {
  it('covers every requiredWhenLive variable', () => {
    expect([...REQUIRED_WHEN_LIVE].sort()).toEqual(declaredWith('requiredWhenLive'))
  })

  it('covers every configuredWhenLive variable', () => {
    expect([...CONFIGURED_WHEN_LIVE].sort()).toEqual(declaredWith('configuredWhenLive'))
  })

  it('covers every Netcash credential', () => {
    expect([...NETCASH_CREDENTIALS].sort()).toEqual(declaredWith('netcashCredential'))
  })

  it('covers every variable gated on Netcash being in use', () => {
    // The third gate, and the reason it exists: these are Netcash endpoint
    // configuration, needed when Netcash is called rather than whenever the
    // deployment is live. They were in the two lists above, and once
    // `isLiveDeployment` was corrected that demanded an endpoint for a service
    // this Foundation has no account with — the DebiCheck application was
    // declined — and the production build stopped.
    expect([...NETCASH_CONFIG].sort()).toEqual(
      [...declaredWith('requiredWhenNetcashInUse'), ...declaredWith('configuredWhenNetcashInUse')].sort(),
    )
  })

  // If the regex ever stops matching the file's shape, every list above would
  // compare empty-to-empty and pass while checking nothing.
  it('actually found declarations to compare against', () => {
    expect(declaredWith('requiredWhenLive').length).toBeGreaterThan(5)
    expect(declaredWith('configuredWhenLive').length).toBeGreaterThan(2)
    expect(declaredWith('netcashCredential').length).toBe(2)
    expect(
      declaredWith('requiredWhenNetcashInUse').length +
        declaredWith('configuredWhenNetcashInUse').length,
    ).toBe(2)
  })
})

describe('go-live preflight — reporting', () => {
  const complete: Record<string, string> = {}
  for (const name of [
    ...REQUIRED_WHEN_LIVE, ...CONFIGURED_WHEN_LIVE, ...NETCASH_CREDENTIALS, ...NETCASH_CONFIG,
  ]) {
    complete[name] = 'set'
  }

  it('reports nothing missing when everything is set', () => {
    expect(preflight({ ...complete, DEPLOY_ENV: 'staging' }).missing).toEqual([])
  })

  it('names exactly what is absent', () => {
    // Was BLOB_READ_WRITE_TOKEN, until that stopped being required: a Blob
    // store connected to a Vercel project authenticates by OIDC, and Vercel
    // recommends revoking the token, so its absence is the intended state.
    const { missing } = preflight({ ...complete, UPSTASH_REDIS_REST_TOKEN: undefined, DEPLOY_ENV: 'staging' })
    expect(missing).toEqual(['UPSTASH_REDIS_REST_TOKEN'])
  })

  // An empty string satisfies "the key exists" but fails `z.string().min(1)`,
  // so treating it as present would report a green light for a boot failure.
  it('treats an empty value as missing', () => {
    expect(preflight({ ...complete, ADMIN_API_SECRET: '', DEPLOY_ENV: 'staging' }).missing).toEqual([
      'ADMIN_API_SECRET',
    ])
  })

  it('skips the Netcash credentials while the gateway is the mock', () => {
    const env = { ...complete, PAYMENT_GATEWAY: 'mock', DEPLOY_ENV: 'staging' }
    delete env.NETCASH_SERVICE_KEY
    delete env.NETCASH_WEBHOOK_SECRET
    expect(preflight(env).missing).toEqual([])
  })

  it('requires the Netcash credentials once the gateway is real', () => {
    const env = { ...complete, PAYMENT_GATEWAY: 'netcash', DEPLOY_ENV: 'staging' }
    delete env.NETCASH_SERVICE_KEY
    expect(preflight(env).missing).toContain('NETCASH_SERVICE_KEY')
  })

  /**
   * This case used to assert the opposite, and its comment explained why:
   * "DEPLOY_ENV wins over VERCEL_ENV — this is why the production deployment
   * runs in non-live mode today despite VERCEL_ENV being production."
   *
   * That was written as an observation and read as a permission. The
   * consequence went untraced: with the deployment believing it was not live,
   * the guard refusing the stand-in payment gateway never fired, and a member's
   * R100 was recorded as a settled payment against a bank nobody had contacted.
   *
   * The platform's answer now outranks the declaration, here and in
   * `isLiveDeployment`, which this must keep agreeing with — it is a second
   * copy of that logic and it carried the same defect.
   */
  it('reads live-ness the same way lib/env.ts does', () => {
    expect(preflight({ DEPLOY_ENV: 'production' }).live).toBe(true)
    expect(preflight({ VERCEL_ENV: 'production' }).live).toBe(true)
    expect(preflight({ VERCEL_ENV: 'preview' }).live).toBe(false)
    expect(preflight({ NODE_ENV: 'production' }).live).toBe(true)

    // A declaration may make a preview stricter, never a production deployment
    // looser.
    expect(preflight({ DEPLOY_ENV: 'production', VERCEL_ENV: 'preview' }).live).toBe(true)
    expect(preflight({ DEPLOY_ENV: 'staging', VERCEL_ENV: 'production' }).live).toBe(true)
  })
})
