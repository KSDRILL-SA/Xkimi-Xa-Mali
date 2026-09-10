import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

/**
 * A member's first name is user-controlled and flows straight into HTML
 * email templates built from hand-written template literals — not JSX,
 * which would escape on its own. Every one of these had no escaping at
 * all until this file: `<h1>Welcome, ${firstName}!</h1>` with
 * firstName = `<img src=x onerror=alert(1)>` renders exactly that image
 * tag in the recipient's inbox. This file proves every named template
 * escapes it, and that the escaping lands only in the HTML body — the
 * plain-text subject line must keep the real name, unescaped.
 */

const mocks = vi.hoisted(() => ({ send: vi.fn().mockResolvedValue({ id: 'mock-id', error: null }) }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send }
  },
}))

vi.mock('@/lib/env', () => ({
  env: { RESEND_API_KEY: 'test-key', RESEND_FROM_EMAIL: 'noreply@xxm.test' },
}))

import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendInviteEmail,
  sendOverdueReminderEmail,
  sendContributionReversedEmail,
  sendStatementReadyEmail,
  sendBadgeLevelUpEmail,
  sendFounderBadgeGrantedEmail,
  sendAdminAlertEmail,
} from '@/lib/email'

const PAYLOAD_NAME = '<img src=x onerror=alert(1)>'
const ESCAPED_NAME = '&lt;img src=x onerror=alert(1)&gt;'

function sentHtml(): string {
  const call = (mocks.send as MockedFunction<typeof mocks.send>).mock.calls[0]![0] as { html: string }
  return call.html
}

beforeEach(() => vi.clearAllMocks())

describe('every named email template escapes the first name in its HTML body', () => {
  it('sendVerificationEmail', async () => {
    await sendVerificationEmail('a@test.com', PAYLOAD_NAME, 'tok', 'https://x.test')
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendPasswordResetEmail', async () => {
    await sendPasswordResetEmail('a@test.com', PAYLOAD_NAME, 'tok', 'https://x.test')
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendWelcomeEmail', async () => {
    await sendWelcomeEmail('a@test.com', PAYLOAD_NAME)
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendPaymentSuccessEmail', async () => {
    await sendPaymentSuccessEmail('a@test.com', PAYLOAD_NAME, '100.00', 'August 2026')
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendPaymentFailedEmail', async () => {
    await sendPaymentFailedEmail('a@test.com', PAYLOAD_NAME, '100.00', 'August 2026', 'https://x.test/dash')
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendInviteEmail', async () => {
    await sendInviteEmail('a@test.com', PAYLOAD_NAME, 'CODE123', 'https://x.test/register')
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendOverdueReminderEmail', async () => {
    await sendOverdueReminderEmail('a@test.com', PAYLOAD_NAME, '100.00', 'August 2026', 'https://x.test/dash')
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendContributionReversedEmail', async () => {
    await sendContributionReversedEmail(
      'a@test.com', PAYLOAD_NAME, '100.00', 'August 2026', 'reason text', 'https://x.test/history',
    )
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendStatementReadyEmail', async () => {
    await sendStatementReadyEmail('a@test.com', PAYLOAD_NAME, 'August 2026', 'https://x.test/statement')
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendBadgeLevelUpEmail', async () => {
    await sendBadgeLevelUpEmail('a@test.com', PAYLOAD_NAME, 'WORLD_CLASS')
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })

  it('sendFounderBadgeGrantedEmail', async () => {
    await sendFounderBadgeGrantedEmail('a@test.com', PAYLOAD_NAME)
    expect(sentHtml()).not.toContain(PAYLOAD_NAME)
    expect(sentHtml()).toContain(ESCAPED_NAME)
  })
})

describe('sendAdminAlertEmail escapes title and detail — neither is authored by a person', () => {
  it('escapes an XSS payload in both the title and the detail', async () => {
    await sendAdminAlertEmail(
      'ops@test.com',
      'gateway said <script>alert(1)</script>',
      'reason: "5 & 6" <b>bold</b>',
    )
    const html = sentHtml()
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })
})

describe('the subject line is plain text, not HTML — it must keep the real name', () => {
  it('sendWelcomeEmail subject is not HTML-escaped', async () => {
    await sendWelcomeEmail('a@test.com', PAYLOAD_NAME)
    const call = (mocks.send as MockedFunction<typeof mocks.send>).mock.calls[0]![0] as { subject: string }
    expect(call.subject).toContain(PAYLOAD_NAME)
  })
})
