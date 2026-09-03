import { describe, it, expect } from 'vitest'
import { isLiveDeployment, isNonLiveDeployment, deploymentEnvironmentName } from '../src/deployment'

/**
 * The distinction this makes is the one NODE_ENV cannot: "is this an optimised
 * build" versus "is this the deployment that serves real members". Getting it
 * wrong in either direction is expensive — too strict and staging cannot exist
 * before production credentials do; too loose and a stand-in gateway reaches
 * real money.
 */

const env = (vars: Record<string, string | undefined>) => vars as NodeJS.ProcessEnv

describe('DEPLOY_ENV decides, except against the platform', () => {
  // The escape hatch. Without it, a CI build and a developer checking their work
  // locally both look exactly like production to NODE_ENV, and a compile check
  // turns into a hunt for a dozen production secrets.
  it('is live only for the exact string "production"', () => {
    expect(isLiveDeployment(env({ DEPLOY_ENV: 'production' }))).toBe(true)
    expect(isLiveDeployment(env({ DEPLOY_ENV: 'ci' }))).toBe(false)
    expect(isLiveDeployment(env({ DEPLOY_ENV: 'staging' }))).toBe(false)
    expect(isLiveDeployment(env({ DEPLOY_ENV: 'development' }))).toBe(false)
  })

  it('overrides NODE_ENV', () => {
    expect(isLiveDeployment(env({ DEPLOY_ENV: 'ci', NODE_ENV: 'production' }))).toBe(false)
  })

  it('may make a deployment stricter than the platform says', () => {
    // The direction that stays allowed: claiming live on a preview, to rehearse
    // production rules before anything real depends on them.
    expect(isLiveDeployment(env({ DEPLOY_ENV: 'production', VERCEL_ENV: 'preview' }))).toBe(true)
  })

  it('may NOT make a live deployment look like something else', () => {
    /**
     * This case asserted the opposite, and the opposite is what happened.
     *
     * DEPLOY_ENV used to be read first and short-circuit, so any value other
     * than "production" answered outright and VERCEL_ENV was never reached.
     * Production ran with DEPLOY_ENV set to a non-live value, so the app
     * believed it was not live — and the guard that refuses the stand-in
     * payment gateway on a live deployment never fired. The stand-in was
     * selected on the real site and answered SUCCESS to every debit. A member
     * paid R100 in the app; a settled transaction was written, the pool was
     * credited and the contribution marked paid, and no bank was ever
     * contacted.
     *
     * VERCEL_ENV is set by Vercel itself and says "production" only for the
     * deployment serving the production domain. Nothing a person types may
     * contradict it, because everything that keeps this system honest hangs off
     * this one boolean.
     */
    for (const declared of ['ci', 'staging', 'development', 'test', '']) {
      expect(
        isLiveDeployment(env({ DEPLOY_ENV: declared, VERCEL_ENV: 'production' })),
        `DEPLOY_ENV=${declared} must not hide a production deployment`,
      ).toBe(true)
    }
  })
})

describe('on Vercel, VERCEL_ENV decides', () => {
  it('is live only for the production environment', () => {
    expect(isLiveDeployment(env({ VERCEL_ENV: 'production' }))).toBe(true)
  })

  it('is not live for preview, which is what staging deploys are', () => {
    expect(isLiveDeployment(env({ VERCEL_ENV: 'preview' }))).toBe(false)
  })

  it('is not live for a development deployment', () => {
    expect(isLiveDeployment(env({ VERCEL_ENV: 'development' }))).toBe(false)
  })

  it('ignores NODE_ENV entirely when VERCEL_ENV is present', () => {
    // The case that matters: every Vercel build sets NODE_ENV=production, so a
    // preview deploy looks exactly like production to NODE_ENV alone.
    expect(isLiveDeployment(env({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }))).toBe(false)
    expect(isLiveDeployment(env({ VERCEL_ENV: 'production', NODE_ENV: 'development' }))).toBe(true)
  })

  it('does not treat an unrecognised value as live', () => {
    // No fuzzy matching: only the exact string counts, so a typo fails safe.
    for (const value of ['Production', 'prod', 'live', 'PRODUCTION']) {
      expect(isLiveDeployment(env({ VERCEL_ENV: value })), value).toBe(false)
    }
  })
})

describe('off Vercel, NODE_ENV is the only signal', () => {
  it('treats a production build as live', () => {
    expect(isLiveDeployment(env({ NODE_ENV: 'production' }))).toBe(true)
  })

  it('is not live in development or test', () => {
    expect(isLiveDeployment(env({ NODE_ENV: 'development' }))).toBe(false)
    expect(isLiveDeployment(env({ NODE_ENV: 'test' }))).toBe(false)
  })

  it('is not live when nothing is set at all', () => {
    expect(isLiveDeployment(env({}))).toBe(false)
  })
})

describe('deploymentEnvironmentName', () => {
  // For tagging observability data, not for branching logic — a preview
  // deploy's errors should say "preview" in Sentry, not merge into
  // "production" the way a bare NODE_ENV tag would.
  it('prefers DEPLOY_ENV, same order as isLiveDeployment', () => {
    expect(
      deploymentEnvironmentName(env({ DEPLOY_ENV: 'staging', VERCEL_ENV: 'production', NODE_ENV: 'production' })),
    ).toBe('staging')
  })

  it('falls back to VERCEL_ENV when DEPLOY_ENV is unset', () => {
    expect(deploymentEnvironmentName(env({ VERCEL_ENV: 'preview', NODE_ENV: 'production' }))).toBe('preview')
  })

  it('falls back to NODE_ENV when nothing Vercel-specific is set', () => {
    expect(deploymentEnvironmentName(env({ NODE_ENV: 'development' }))).toBe('development')
  })

  it('returns "unknown" rather than undefined when nothing is set', () => {
    expect(deploymentEnvironmentName(env({}))).toBe('unknown')
  })
})

describe('isNonLiveDeployment', () => {
  it('is the exact inverse', () => {
    for (const vars of [
      { VERCEL_ENV: 'production' },
      { VERCEL_ENV: 'preview' },
      { NODE_ENV: 'production' },
      { NODE_ENV: 'test' },
      {},
    ]) {
      expect(isNonLiveDeployment(env(vars))).toBe(!isLiveDeployment(env(vars)))
    }
  })
})
