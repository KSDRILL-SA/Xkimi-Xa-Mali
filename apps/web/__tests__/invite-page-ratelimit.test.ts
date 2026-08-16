import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The invite page ran the same check as the API route, behind nothing.
 *
 * `POST /api/v1/auth/invitations/validate` calls `validateInviteCode` behind
 * `authRatelimit`. `GET /invite/[token]` called it behind no limiter at all,
 * and `proxy.ts` waves `/invite/` through as a public page — so the route
 * was throttled and the page beside it was an open oracle for the identical
 * check.
 *
 * Two paths to one check with one of them hardened is the shape this repository
 * keeps finding, and it does not stop being that shape because the codes happen
 * to be forty bits.
 */

const read = (relative: string) => readFileSync(resolve(__dirname, relative), 'utf8')

/** Code with comments stripped — the page explains what it no longer does. */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const page = code(read('../app/(auth)/invite/[token]/page.tsx'))
const route = code(read('../app/api/v1/auth/invitations/validate/route.ts'))
const errorView = read('../components/auth/InviteErrorView.tsx')

describe('the page is throttled like the route', () => {
  it('limits before validating anything', () => {
    const limitAt = page.indexOf('authRatelimit.limit')
    const validateAt = page.indexOf('validateInviteCode(token)')

    expect(limitAt).toBeGreaterThan(-1)
    expect(limitAt).toBeLessThan(validateAt)
  })

  it('does not call the service at all once the limit is spent', () => {
    // The lookup is inside the else branch, so a throttled request never
    // reaches the database and never learns anything about the code.
    expect(page).toMatch(/if\s*\(!success\)[\s\S]{0,120}else\s*\{[\s\S]{0,200}validateInviteCode/)
  })

  it('uses the same limiter as the route, so the two share one budget', () => {
    expect(page).toContain('authRatelimit')
    expect(route).toContain('authRatelimit')
  })

  it('keys on the request source through the shared trust model', () => {
    // Not `x-forwarded-for` read raw — that header is attacker-controlled
    // anywhere the front door does not overwrite it.
    expect(page).toContain('clientIpFromHeaders')
    expect(page).not.toContain("get('x-forwarded-for')")
  })
})

describe('what a throttled visitor is told', () => {
  it('has a message for the throttled case', () => {
    expect(errorView).toContain('SYS_005')
    expect(errorView).toMatch(/too many attempts/i)
  })

  it('says nothing about the code that was tried', () => {
    // Somebody working through codes must not learn from this screen whether
    // any of them was real. The message names the connection, not the invite.
    const block = errorView.slice(errorView.indexOf('SYS_005'), errorView.indexOf('SYS_005') + 260)
    expect(block).not.toMatch(/invalid|expired|revoked|already been used/i)
  })
})
