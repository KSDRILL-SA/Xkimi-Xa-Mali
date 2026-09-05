import { describe, it, expect, vi, beforeEach } from 'vitest'
import { redact, isRedactedKey, REDACTED } from '../src/redact'

// ---------------------------------------------------------------------------
// What log metadata is not allowed to carry.
//
// This is not only about log files. `logger.error` sends every entry to Sentry
// and `logger.warn` attaches one as a breadcrumb, so a field added for local
// debugging leaves the country and lands with a third-party processor. For a
// system holding ID numbers, bank details and phone numbers, that is a
// processor question rather than a tidiness one.
//
// The call sites that carried contact details have been cleaned. This is the
// half that keeps them clean: the next one is written by somebody in a hurry,
// and `{ err }` on its own looks harmless.
// ---------------------------------------------------------------------------

describe('what gets redacted', () => {
  it('replaces contact details', () => {
    expect(redact({ email: 'k@x.co.za', phone: '+27821234567' })).toEqual({
      email: REDACTED,
      phone: REDACTED,
    })
  })

  it('replaces identity and banking details', () => {
    expect(redact({ idNumber: '9001015800088', accountNumber: '1234567890' })).toEqual({
      idNumber: REDACTED,
      accountNumber: REDACTED,
    })
  })

  it('replaces credentials', () => {
    const out = redact({ token: 'abc', serviceKey: 'k', signature: 'sig', password: 'p' })
    expect(out).toEqual({
      token: REDACTED, serviceKey: REDACTED, signature: REDACTED, password: REDACTED,
    })
  })

  it('is case-insensitive on the key', () => {
    expect(redact({ Email: 'k@x.co.za', ID_NUMBER: 'x' })).toMatchObject({ Email: REDACTED })
  })

  it('matches whole keys only, so counters survive', () => {
    // `emailSent` is how many messages went out. Losing it would cost the
    // reason somebody added the log line, and a redactor that eats useful
    // fields teaches people to stop trusting the logs.
    expect(redact({ emailSent: 3, phoneVerified: true })).toEqual({
      emailSent: 3,
      phoneVerified: true,
    })
  })
})

describe('where it looks', () => {
  it('walks nested objects', () => {
    expect(redact({ member: { id: 'u1', email: 'k@x.co.za' } })).toEqual({
      member: { id: 'u1', email: REDACTED },
    })
  })

  it('walks arrays', () => {
    expect(redact({ recipients: [{ phone: '+27821234567' }] })).toEqual({
      recipients: [{ phone: REDACTED }],
    })
  })

  it('catches the fields an Error carries of its own accord', () => {
    // The vector nobody would look for. `serialize` spreads an Error's own
    // enumerable properties into the entry — good, because a gateway client
    // attaching `err.response` is exactly what you want to see, and dangerous,
    // because a mail or SMS provider's error can carry the recipient without
    // any call site naming them.
    const err = Object.assign(new Error('send failed'), {
      response: { to: 'k@x.co.za', email: 'k@x.co.za', status: 422 },
    })
    const serialised = { name: err.name, message: err.message, ...err }

    expect(redact({ err: serialised })).toMatchObject({
      err: { message: 'send failed', response: { email: REDACTED, status: 422 } },
    })
  })

  it('survives a cycle instead of hanging', () => {
    const a: Record<string, unknown> = { id: 'u1' }
    a.self = a

    expect(redact(a)).toEqual({ id: 'u1', self: '[circular]' })
  })

  it('stops rather than passing deep values through unredacted', () => {
    // An unreadable log is recoverable; a leaked one is not.
    let deep: Record<string, unknown> = { email: 'k@x.co.za' }
    for (let i = 0; i < 12; i++) deep = { nested: deep }

    expect(JSON.stringify(redact(deep))).not.toContain('k@x.co.za')
  })
})

describe('what it leaves alone', () => {
  it('does not touch primitives', () => {
    expect(redact('k@x.co.za')).toBe('k@x.co.za')
    expect(redact(42)).toBe(42)
    expect(redact(null)).toBe(null)
  })

  it('leaves dates as values rather than walking them', () => {
    const d = new Date('2026-09-05T00:00:00Z')
    expect(redact({ at: d })).toEqual({ at: d })
  })

  it('never mutates the caller’s object', () => {
    // Metadata is very often the object the request is still using. A logger
    // that quietly empties a field turns observability into a correctness bug.
    const meta = { email: 'k@x.co.za', nested: { phone: '+27821234567' } }
    redact(meta)

    expect(meta.email).toBe('k@x.co.za')
    expect(meta.nested.phone).toBe('+27821234567')
  })

  it('does not redact names or free text', () => {
    // Deliberately narrow. A redactor broad enough to catch everything redacts
    // the message you needed. A phone number written into a message string is
    // a call-site problem and stays one.
    expect(redact({ firstName: 'Kurhula', message: 'called +27821234567' })).toEqual({
      firstName: 'Kurhula',
      message: 'called +27821234567',
    })
  })
})

describe('isRedactedKey', () => {
  it.each(['email', 'PHONE', 'idNumber', 'accountNumber', 'password', 'serviceKey'])(
    'refuses %s', (key) => expect(isRedactedKey(key)).toBe(true),
  )

  it.each(['emailSent', 'userId', 'inviteId', 'amount', 'status'])(
    'permits %s', (key) => expect(isRedactedKey(key)).toBe(false),
  )
})

// ---------------------------------------------------------------------------
// End to end, through the logger the apps actually import.
// ---------------------------------------------------------------------------

const sentry = vi.hoisted(() => ({ captureException: vi.fn(), captureMessage: vi.fn(), addBreadcrumb: vi.fn() }))
vi.mock('@sentry/nextjs', () => sentry)

describe('the logger itself', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not send a contact detail to Sentry', async () => {
    const { logger } = await import('../src/logger')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('Invite email delivery failed', { inviteId: 'inv1', email: 'k@x.co.za' })

    const sent = JSON.stringify(sentry.captureMessage.mock.calls)
    expect(sent).not.toContain('k@x.co.za')
    expect(sent).toContain('inv1')
  })
})
