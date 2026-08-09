import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * When this system and the bank stop agreeing about a mandate.
 *
 * `updateMandate` and `cancelMandate` both write locally first and tell Netcash
 * second — deliberately, so a member who asks to stop being collected from is
 * never collected from by us again, whatever the gateway does. The cost of that
 * ordering is a window where the two disagree, and the entire response to
 * landing in it was one `logger.error` and a comment saying "manual
 * reconciliation required", addressed to nobody.
 *
 * Nothing else was looking either: `mandate-status-sync` reads only PENDING,
 * ACTIVE and SUSPENDED, so a cancellation that failed at the gateway is never
 * examined again by anything, ever.
 */

const mocks = vi.hoisted(() => ({
  raiseAlert: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  gatewayUpdate: vi.fn(),
  gatewayCancel: vi.fn(),
  gatewayDelay: vi.fn(),
  inngestSend: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/encryption', () => ({ decrypt: vi.fn(), maskStoredSecret: vi.fn(() => '****1234') }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: mocks.raiseAlert }))
vi.mock('@/services/inbox.service', () => ({ notifyAdmins: vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.logError, debug: vi.fn() },
}))
vi.mock('@/lib/inngest', () => ({
  inngest: { send: mocks.inngestSend },
  InngestEvents: { MANDATE_DELAY_HANDLER: 'xxm/mandate.delay-handler' },
}))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: {
    updateMandate: mocks.gatewayUpdate,
    cancelMandate: mocks.gatewayCancel,
    delayMandate: mocks.gatewayDelay,
    getNextDebitDate: vi.fn(() => '2026-09-01'),
    mapMandateStatus: vi.fn((s: string) => s),
  },
}))
vi.mock('@/repositories/mandate.repository', () => ({
  mandateRepo: { findById: mocks.findById, update: mocks.update, findFirst: vi.fn(), findMany: vi.fn() },
}))
vi.mock('@/repositories/bank-account.repository', () => ({ bankAccountRepo: { findById: vi.fn() } }))
vi.mock('@/repositories/user.repository', () => ({ userRepo: { findById: vi.fn(), update: vi.fn() } }))
vi.mock('@/lib/role-version', () => ({ bumpRoleVersion: vi.fn() }))

import { updateMandate, cancelMandate, requestDelay } from '@/services/mandate.service'

const ACTIVE_MANDATE = {
  id: 'mandate-1',
  userId: 'user-1',
  status: 'ACTIVE',
  amount: 450,
  debitDay: 25,
  netcashMandateId: 'NC-777',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockResolvedValue(ACTIVE_MANDATE)
  mocks.update.mockResolvedValue({ ...ACTIVE_MANDATE })
  mocks.gatewayUpdate.mockResolvedValue(undefined)
  mocks.gatewayCancel.mockResolvedValue(undefined)
  mocks.gatewayDelay.mockResolvedValue(undefined)
  mocks.inngestSend.mockResolvedValue(undefined)
  mocks.raiseAlert.mockResolvedValue(undefined)
})

describe('an amendment that did not reach the bank', () => {
  it('raises an alert rather than only writing a log line', async () => {
    mocks.gatewayUpdate.mockRejectedValue(new Error('NIWS timeout'))

    await updateMandate('mandate-1', { amount: 600 }, 'user-1', [])

    const alert = mocks.raiseAlert.mock.calls[0][0]
    expect(alert).toMatchObject({ code: 'MANDATE_GATEWAY_DESYNC', severity: 'warning' })
    expect(alert.payload).toMatchObject({ operation: 'update', netcashMandateId: 'NC-777' })
  })

  it('says what the disagreement will actually cause', async () => {
    // The debit run submits the amount held here, so the next collection can be
    // refused for exceeding what the member authorised at their bank. An alert
    // that says only "sync failed" leaves the reader to work that out.
    mocks.gatewayUpdate.mockRejectedValue(new Error('NIWS timeout'))

    await updateMandate('mandate-1', { amount: 600 }, 'user-1', [])

    expect(mocks.raiseAlert.mock.calls[0][0].body).toMatch(/refused for exceeding/i)
  })

  it('still applies the change locally, because that is the source of truth', async () => {
    mocks.gatewayUpdate.mockRejectedValue(new Error('NIWS timeout'))

    await expect(updateMandate('mandate-1', { amount: 600 }, 'user-1', [])).resolves.toBeDefined()
    expect(mocks.update).toHaveBeenCalled()
  })

  it('says nothing when the gateway accepted it', async () => {
    await updateMandate('mandate-1', { amount: 600 }, 'user-1', [])
    expect(mocks.raiseAlert).not.toHaveBeenCalled()
  })
})

describe('a cancellation that did not reach the bank', () => {
  it('raises an alert naming the mandate left standing', async () => {
    mocks.gatewayCancel.mockRejectedValue(new Error('service key rejected'))

    await cancelMandate('mandate-1', 'user-1', [])

    const alert = mocks.raiseAlert.mock.calls[0][0]
    expect(alert).toMatchObject({ code: 'MANDATE_GATEWAY_DESYNC', severity: 'warning' })
    expect(alert.payload.operation).toBe('cancel')
    expect(alert.body).toContain('NC-777')
  })

  it('says that nothing else will ever find this', async () => {
    // mandate-status-sync reads PENDING, ACTIVE and SUSPENDED only, so a
    // locally-cancelled mandate is never looked at again. Whoever reads the
    // alert has to know that no nightly job is going to clean it up.
    mocks.gatewayCancel.mockRejectedValue(new Error('service key rejected'))

    await cancelMandate('mandate-1', 'user-1', [])

    expect(mocks.raiseAlert.mock.calls[0][0].body).toMatch(/mandate-status-sync only reads/i)
  })

  it('still cancels locally, so we never collect from them again', async () => {
    mocks.gatewayCancel.mockRejectedValue(new Error('service key rejected'))

    await cancelMandate('mandate-1', 'user-1', [])

    expect(mocks.update).toHaveBeenCalledWith('mandate-1', { status: 'CANCELLED' })
  })
})

describe('a delay that was accepted but never scheduled', () => {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  it('withdraws the skip rather than leaving the member uncollected', async () => {
    // `delayedUntil` makes the debit run skip them; the event is what charges
    // them afterwards. If the second half fails and the first stands, they are
    // skipped by the debit run and charged by nothing — not late, not failed,
    // simply never collected for the period, with no failed transaction and no
    // trace that money was ever due.
    mocks.inngestSend.mockRejectedValue(new Error('inngest unreachable'))

    await expect(requestDelay('mandate-1', { newDate: future }, 'user-1', [])).rejects.toThrow()

    expect(mocks.update).toHaveBeenCalledWith('mandate-1', { delayedUntil: null })
  })

  it('raises a critical alert, because they asked not to be debited that day', async () => {
    mocks.inngestSend.mockRejectedValue(new Error('inngest unreachable'))

    await expect(requestDelay('mandate-1', { newDate: future }, 'user-1', [])).rejects.toThrow()

    const alert = mocks.raiseAlert.mock.calls[0][0]
    expect(alert).toMatchObject({ code: 'MANDATE_DELAY_NOT_SCHEDULED', severity: 'critical' })
    expect(alert.body).toContain(future)
  })

  it('sets the skip and keeps it when the event is sent', async () => {
    await requestDelay('mandate-1', { newDate: future }, 'user-1', [])

    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.update.mock.calls[0][1].delayedUntil).toBeInstanceOf(Date)
    expect(mocks.inngestSend).toHaveBeenCalledOnce()
    expect(mocks.raiseAlert).not.toHaveBeenCalled()
  })
})

describe('what the page sends to the browser', () => {
  it('names the fields rather than spreading the row', async () => {
    // Everything handed to a client component is serialised into the RSC
    // payload and readable in the page source. The spread sent `userId`,
    // `bankAccountId`, `delayedUntil` and `netcashMandateId` — the handle used
    // to cancel, amend and delay this mandate at the gateway. MandateCard
    // declares six fields, and TypeScript's structural typing accepts an object
    // carrying more, so nothing complained and nothing would have.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const page = readFileSync(
      resolve(__dirname, '../app/(member)/dashboard/mandates/page.tsx'),
      'utf8',
    )

    const block = page.slice(page.indexOf('const maskedMandates'), page.indexOf('const hasActiveOrPending'))
    expect(block).not.toContain('...m,')
    expect(block).not.toContain('netcashMandateId')
    for (const field of ['id:', 'status:', 'amount:', 'debitDay:', 'createdAt:']) {
      expect(block, field).toContain(field)
    }
  })
})
