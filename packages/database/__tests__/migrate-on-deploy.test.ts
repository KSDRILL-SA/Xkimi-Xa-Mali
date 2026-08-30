import { describe, it, expect } from 'vitest'
// @ts-expect-error — plain .mjs build script, no type declarations
import { decide } from '../scripts/migrate-on-deploy.mjs'

/**
 * `prisma migrate deploy` runs as part of the production Vercel build, because
 * nothing in the pipeline ran it before and every schema change had to be
 * applied to production by hand.
 *
 * The reason this is tested rather than trusted:
 *
 * `DATABASE_URL` and `DIRECT_DATABASE_URL` are scoped to **Production and
 * Preview** on these projects, with the same values. Every preview deployment
 * talks to the live database. So the environment gate is the only thing
 * standing between an open pull request and a migrated production database —
 * a branch's migrations would otherwise be applied the moment a preview built,
 * before review, before merge, and for branches never merged at all.
 *
 * A guard that is only ever checked by hand is one a refactor can quietly
 * delete. These assert the decision itself, so removing the gate fails CI.
 */
describe('migrate-on-deploy gate', () => {
  const PROD = {
    VERCEL: '1',
    VERCEL_ENV: 'production',
    DIRECT_DATABASE_URL: 'postgresql://direct',
  }

  it('migrates on a production Vercel build with a direct connection', () => {
    expect(decide(PROD).action).toBe('migrate')
  })

  // The case that matters most.
  it('never migrates on a preview build, even though preview shares the production database', () => {
    expect(decide({ ...PROD, VERCEL_ENV: 'preview' }).action).toBe('skip')
  })

  it('never migrates on a local or CI build', () => {
    expect(decide({ VERCEL_ENV: 'production', DIRECT_DATABASE_URL: 'postgresql://direct' }).action).toBe('skip')
  })

  it('never migrates when VERCEL_ENV is absent', () => {
    expect(decide({ VERCEL: '1', DIRECT_DATABASE_URL: 'postgresql://direct' }).action).toBe('skip')
  })

  it('honours the explicit opt-out even in production', () => {
    const decision = decide({ ...PROD, SKIP_DEPLOY_MIGRATIONS: '1' })
    expect(decision.action).toBe('skip')
    expect(decision.reason).toMatch(/SKIP_DEPLOY_MIGRATIONS/)
  })

  // Migrating over the pooled endpoint silently loses the advisory lock and
  // session state `migrate` depends on. Stop rather than guess.
  it('fails the build in production when DIRECT_DATABASE_URL is missing', () => {
    const decision = decide({ VERCEL: '1', VERCEL_ENV: 'production' })
    expect(decision.action).toBe('fail')
    expect(decision.reason).toMatch(/DIRECT_DATABASE_URL/)
  })

  it('reports a reason for every outcome, so build logs say why', () => {
    for (const env of [{}, PROD, { ...PROD, VERCEL_ENV: 'preview' }, { VERCEL: '1', VERCEL_ENV: 'production' }]) {
      expect(decide(env).reason).toBeTruthy()
    }
  })
})
