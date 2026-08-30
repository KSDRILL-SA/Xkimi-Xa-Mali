import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { BULKSMS_USERNAME: 'u', BULKSMS_PASSWORD: 'p' },
}))

import { ensureSenderIdentity } from '@/lib/bulksms'

/**
 * South African networks do not support alphanumeric sender IDs — BulkSMS is
 * explicit that they "are not available in South Africa due to mobile network
 * operator policies". Every SMS therefore arrives from a bare number the
 * recipient does not recognise, and the message body is the only place the
 * Foundation can identify itself.
 *
 * An SMS about someone's money from an unknown number, with no name in it, is
 * indistinguishable from a scam — and the right response to a scam is to
 * ignore it. So this is not branding, it is whether the member can safely act
 * on what we send them.
 *
 * The guarantee lives at the transport boundary rather than in the copy
 * because the copy is not the only source of message bodies: production reads
 * template bodies from the database (seeded create-only, so edits to
 * `templates.ts` never reach an already-seeded database), and admin broadcasts
 * are typed by hand and pass through no template at all.
 */
describe('ensureSenderIdentity', () => {
  const ORG = 'Xkimi Xa Mali Foundation'

  it('prefixes a body that does not name the Foundation', () => {
    expect(ensureSenderIdentity('Your payment was received.')).toBe(
      `${ORG}: Your payment was received.`,
    )
  })

  it('leaves an already-compliant body untouched', () => {
    const body = `${ORG}: R500,00 contribution received.`
    expect(ensureSenderIdentity(body)).toBe(body)
  })

  // `admin-alert-sms` reads "Xkimi Xa Mali Foundation alert: ..." — the name
  // leads, which is what matters. Requiring the colon would double-prefix a
  // template that was already correct.
  it('accepts the name followed by something other than a colon', () => {
    const body = `${ORG} alert: Job failed.`
    expect(ensureSenderIdentity(body)).toBe(body)
  })

  // The real risk of a prefixing guard is that it stacks on re-entry — a
  // retried send, or a body that already passed through it once.
  it('is idempotent', () => {
    const once = ensureSenderIdentity('Log in to continue.')
    expect(ensureSenderIdentity(once)).toBe(once)
    expect(once.match(/Xkimi Xa Mali Foundation/g)).toHaveLength(1)
  })

  it('does not double-prefix when the name is cased differently', () => {
    const body = 'XKIMI XA MALI FOUNDATION: Your debit ran today.'
    expect(ensureSenderIdentity(body)).toBe(body)
  })

  it('does not produce a stray prefix when the body has leading whitespace', () => {
    expect(ensureSenderIdentity(`  ${ORG}: Hello.`)).toBe(`${ORG}: Hello.`)
  })

  // The case that sent this bug to production: an admin broadcast is free text
  // with no template behind it, so nothing else in the system would name us.
  it('identifies the Foundation in a free-text admin broadcast', () => {
    const result = ensureSenderIdentity('Meeting moved to Saturday 10am.')
    expect(result.startsWith(ORG)).toBe(true)
  })
})
