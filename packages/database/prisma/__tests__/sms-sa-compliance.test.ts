import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TEMPLATES } from '../templates'

/**
 * South African networks do not support alphanumeric sender IDs.
 *
 * BulkSMS states it plainly: "Sender IDs are not available in South Africa due
 * to mobile network operator policies." It is not a registration step that has
 * been skipped — the networks refuse them, so an SMS from this platform always
 * arrives from a bare shortcode with no name attached.
 *
 * What SA requires instead is that the organisation is identified at the START
 * of the message body. That is the only thing standing between a member and an
 * unattributed SMS about their money, which is exactly the shape of a scam.
 *
 * The rule is invisible in code — nothing fails, nothing warns, and a new
 * template that forgets it looks perfectly fine in review and in the seed. So
 * it is asserted here.
 *
 * Source: https://www.bulksms.com/countries/s/south-africa
 */
const ORG_PREFIX = 'Xkimi Xa Mali Foundation'

describe('SMS templates — South African sender identification', () => {
  const smsTemplates = NOTIFICATION_TEMPLATES.filter((t) => t.channel === 'SMS')

  it('has SMS templates to check', () => {
    expect(smsTemplates.length).toBeGreaterThan(0)
  })

  // Asserts the name LEADS the message, not the exact punctuation after it.
  // `admin-alert-sms` legitimately reads "Xkimi Xa Mali Foundation alert: ..."
  // rather than "Xkimi Xa Mali Foundation: ...", and both satisfy the rule —
  // what matters to a recipient is seeing who sent it first, before anything
  // else. Pinning the colon would fail a compliant template and invite someone
  // to "fix" copy that was already correct.
  it.each(smsTemplates.map((t) => [t.slug, t.body] as const))(
    '%s names the Foundation at the start of the body',
    (_slug, body) => {
      expect(body.startsWith(ORG_PREFIX)).toBe(true)
    },
  )
})
