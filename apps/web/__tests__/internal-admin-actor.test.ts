import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * A trusted internal request has no session, and the actor may not be invented.
 *
 * The admin console calls these routes server to server. There is no cookie, so
 * `auth()` returns null and `session?.user?.id` is always undefined on that
 * path. The broadcast route fell back to the literal string `'system'` and used
 * it as the acting admin — writing it to `inbox_messages.createdById` and to the
 * audit log, both foreign keys to `users.id`. No user has that id, so **every**
 * broadcast ever sent from the console failed on a constraint: the in-app one
 * before delivering anything, and SMS or email *after* the messages had gone out
 * and been charged for, losing the record of a send that really happened.
 *
 * It survived 1,663 passing tests, a clean typecheck, a clean lint and a
 * successful build, because nothing exercised the cross-app hop. This test is
 * the cheap guard: it reads the routes rather than running them, and it fails on
 * the shape of the mistake rather than on its symptom.
 *
 * `resolveInternalAdmin` is the correct answer — it reads the forwarded
 * `x-admin-user-id` and confirms it belongs to a live admin.
 */

const API_ROOT = path.resolve(__dirname, '..', 'app', 'api')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...routeFiles(full))
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

/** Routes that accept the trusted server-to-server path at all. */
const INTERNAL_ROUTES = routeFiles(API_ROOT)
  .map((file) => ({ file, src: readFileSync(file, 'utf8') }))
  .filter((r) => r.src.includes('isValidInternalRequest'))
  .map((r) => ({ ...r, rel: path.relative(API_ROOT, r.file).replace(/\\/g, '/') }))

describe('routes reachable by a trusted internal request', () => {
  it('there are some, so this suite is testing something', () => {
    expect(INTERNAL_ROUTES.length).toBeGreaterThan(0)
  })

  for (const route of INTERNAL_ROUTES) {
    /**
     * Only routes that attribute an action to a person need an identified one.
     * A read-only export or ledger view derives `roles` and never an `adminId`,
     * and requiring a named admin there would be ceremony rather than safety.
     */
    const attributesToAPerson = /\badminId\b/.test(route.src)

    it(`${route.rel} never invents an actor`, () => {
      // The exact shape of the defect: a fallback that yields a string which is
      // not a user id, on the one path where there is never a session to read.
      expect(route.src).not.toMatch(/\?\?\s*['"]system['"]/)
      expect(route.src).not.toMatch(/=\s*['"]system['"]/)
    })

    if (attributesToAPerson) {
      it(`${route.rel} resolves the acting admin instead of reading a session`, () => {
        expect(route.src).toContain('resolveInternalAdmin')
      })
    }
  }
})
