import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The broadcast email, against the real template rather than a mock of it.
 *
 * `broadcastNotification` used to build this markup inline and escape as it
 * went, and `admin.service.test.ts` asserted the escaping by reading the HTML
 * it produced. The markup has moved into `sendBroadcastEmail`, which is where
 * every other email's template lives — so the assertion has to move with it,
 * or a real protection would be left covered only by a test of a mock.
 *
 * Two inputs are attacker-reachable by different routes: a member sets their
 * own first name, and an admin — or a compromised admin account — writes the
 * subject and the body. None of them may inject markup into an email that
 * every recipient's client renders.
 */

const mocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send }
  },
}))

vi.mock('@/lib/env', () => ({
  env: {
    RESEND_API_KEY: 'test-key',
    RESEND_FROM_EMAIL: 'noreply@xkimixamali.co.za',
    NEXTAUTH_URL: 'https://member.test',
    SUPPORT_EMAIL: 'support@xkimixamali.co.za',
    WHATSAPP_GROUP_LINK: 'https://chat.example',
  },
}))

import { sendBroadcastEmail } from '@/lib/email'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.send.mockResolvedValue({ data: { id: 'x' }, error: null })
})

const htmlOf = () => mocks.send.mock.calls[0]![0].html as string

describe('what reaches the recipient', () => {
  it('escapes a member’s own name', async () => {
    await sendBroadcastEmail('a@x.co.za', '<img src=x onerror=alert(1)>', 'Notice', 'Body text')

    const html = htmlOf()
    expect(html).not.toContain('<img src=x onerror=alert(1)>')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('escapes the body an admin typed', async () => {
    await sendBroadcastEmail('a@x.co.za', 'Kurhula', 'Notice', 'Click <script>steal()</script> here')

    const html = htmlOf()
    expect(html).not.toContain('<script>steal()</script>')
    expect(html).toContain('&lt;script&gt;steal()&lt;/script&gt;')
  })

  it('escapes the subject, in the heading and in the subject line', async () => {
    // The subject is used three times — heading, subject, preheader. Escaping
    // it in one place and not another is the easy mistake here.
    await sendBroadcastEmail('a@x.co.za', 'Kurhula', '<b>urgent</b>', 'Body text')

    const call = mocks.send.mock.calls[0]![0]
    expect(call.html).not.toContain('<b>urgent</b>')
    expect(call.html).toContain('&lt;b&gt;urgent&lt;/b&gt;')
  })
})

describe('the subject line', () => {
  it('is what the sender wrote, not the Foundation’s name', async () => {
    // It was the constant "Message from Xkimi Xa Mali Foundation" on every
    // send: the same words for a meeting reminder and a change to the
    // contribution amount.
    await sendBroadcastEmail('a@x.co.za', 'Kurhula', 'September meeting moved', 'We meet Saturday.')

    expect(mocks.send.mock.calls[0]![0].subject).toBe('September meeting moved')
  })
})

describe('the shape of the message', () => {
  it('keeps a blank line between paragraphs as two paragraphs', async () => {
    // The composer is a textarea. Two thoughts typed as two paragraphs used to
    // arrive as one block, because the old markup put the whole message in a
    // single element with `white-space: pre-wrap`.
    await sendBroadcastEmail('a@x.co.za', 'Kurhula', 'Notice', 'First thought.\n\nSecond thought.')

    const html = htmlOf()
    expect(html).toContain('First thought.')
    expect(html).toContain('Second thought.')
    // Two paragraphs, not one containing both.
    expect(html).not.toMatch(/First thought\.[\s\S]{0,20}Second thought\./)
  })

  it('uses the shared shell and type scale, not markup of its own', async () => {
    // The broadcast was the one email that hand-rolled a bare div, so the
    // message a member is most likely to read was the only one that looked
    // undesigned.
    await sendBroadcastEmail('a@x.co.za', 'Kurhula', 'Notice', 'Body text')

    const html = htmlOf()
    expect(html).toContain('Announcement')
    expect(html).not.toContain('font-family:sans-serif;max-width:560px')
  })
})
