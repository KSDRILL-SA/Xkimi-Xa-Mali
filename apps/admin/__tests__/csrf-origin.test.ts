import { describe, it, expect } from 'vitest'
import { verifyCsrfOrigin } from '@xxm/utils/csrf-origin'

/**
 * The admin console had no origin check at all.
 *
 * The member app has verified the origin of every mutating request since #266.
 * This app — the one that approves mandates, reverses transactions and suspends
 * members — never did. An admin with a live session who loaded an attacker's
 * page was one form post away from any of those.
 *
 * The helper now lives in `@xxm/utils` and both middlewares import it. Copying
 * it across would have reproduced the failure §9 of the operating manual names
 * as recurring here: a control applied to one app and not its sibling, with
 * nothing keeping the two in step.
 */

const ADMIN = 'https://admin.xkimmxamali.co.za'

function request(headers: Record<string, string>, url = `${ADMIN}/members/123`) {
  return { headers: new Headers(headers), nextUrl: new URL(url) }
}

describe('cross-origin state changes on the admin console', () => {
  it('accepts a post from the console itself', () => {
    expect(verifyCsrfOrigin(request({ origin: ADMIN }))).toBe(true)
  })

  it('refuses a post from somewhere else', () => {
    expect(verifyCsrfOrigin(request({ origin: 'https://evil.example' }))).toBe(false)
  })

  it('refuses a post carrying no origin and no referer', () => {
    // A form auto-submitted from another page is the shape this exists for, and
    // failing closed on an absent header is the only safe reading.
    expect(verifyCsrfOrigin(request({}))).toBe(false)
  })

  it('falls back to referer for a same-origin navigation that omits origin', () => {
    expect(verifyCsrfOrigin(request({ referer: `${ADMIN}/members` }))).toBe(true)
  })

  it('is not fooled by an origin that merely starts with the real one', () => {
    expect(verifyCsrfOrigin(request({ origin: `${ADMIN}.evil.example` }))).toBe(false)
  })
})

describe('the middleware actually applies it', () => {
  const source = async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(__dirname, '../middleware.ts'), 'utf8')
  }

  it('checks every mutating request, not only /api/*', async () => {
    // Almost nothing here is an API route: the console is server actions, which
    // are POSTs to the page's own URL. Scoping this to `/api/` as the member app
    // does would have covered the two export routes and none of the actions
    // that move money.
    const text = await source()

    expect(text).toContain('verifyCsrfOrigin')
    expect(text).toContain('MUTATING_METHODS.has(req.method)')
    expect(text).not.toMatch(/MUTATING_METHODS\.has\(req\.method\)[\s\S]{0,80}startsWith\('\/api/)
  })

  it('imports the shared helper rather than carrying its own copy', async () => {
    const text = await source()
    expect(text).toContain("from '@xxm/utils/csrf-origin'")
  })
})
