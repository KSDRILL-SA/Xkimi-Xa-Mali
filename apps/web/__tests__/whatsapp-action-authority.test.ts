import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A server action is a public endpoint.
 *
 * `admin-action.ts` states it at the top of the admin console's gate: a server
 * action "is reachable by anyone who can craft the request, whether or not the
 * page that renders the form was ever shown to them, so each one has to
 * establish who is calling on its own".
 *
 * The WhatsApp preference action did not. It took `userId` as a bound argument
 * and trusted it, and nothing downstream would have caught that —
 * `updateNotificationPreferences` takes a bare `userId` and no requester. So a
 * signed-in member could switch another member's WhatsApp notifications off by
 * naming their id.
 *
 * The audit trail was forgeable too: the IP came from `x-forwarded-for` read
 * directly, which is attacker-controlled anywhere the front door does not
 * overwrite it. This value is what gets recorded about the caller, so read raw,
 * the caller chose it. The admin console needed the same fix.
 */

const source = readFileSync(
  resolve(__dirname, '../app/(member)/dashboard/whatsapp/page.tsx'),
  'utf8',
)

/** Code with comments stripped — the file explains what it no longer does. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const action = code.slice(code.indexOf('async function setWhatsAppPreference'), code.indexOf('export default'))

describe('the action establishes its own caller', () => {
  it('takes no user id as an argument', () => {
    expect(action).not.toMatch(/setWhatsAppPreference\([^)]*userId/)
  })

  it('reads the member from the session instead', () => {
    expect(action).toContain('await getSession()')
    expect(action).toContain('session.user.id')
  })

  it('redirects rather than proceeding when there is no session', () => {
    expect(action).toContain("redirect('/login')")
  })

  it('is bound without a member id at both call sites', () => {
    // `.bind(null, true, userId)` was the shape that made the id forgeable.
    expect(code).toContain('setWhatsAppPreference.bind(null, true)')
    expect(code).toContain('setWhatsAppPreference.bind(null, false)')
    expect(code).not.toMatch(/setWhatsAppPreference\.bind\([^)]*userId/)
  })
})

describe('the audit trail cannot be chosen by the caller', () => {
  it('takes the IP through the shared trust model', () => {
    expect(action).toContain('clientIpFromHeaders')
  })

  it('does not read x-forwarded-for directly', () => {
    // Attacker-controlled anywhere the front door does not overwrite it, and
    // this value is what gets recorded about the caller.
    expect(code).not.toContain("get('x-forwarded-for')")
  })
})
