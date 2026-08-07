import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The nightly mandate reconciliation, end to end, through a stub step runner.
 *
 * The debit run collects only from ACTIVE mandates, so anything that moves a
 * mandate out of ACTIVE stops that member's contributions. This job is the only
 * thing that does so without a webhook.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  getMandateStatus: vi.fn(),
  mapMandateStatus: vi.fn(),
  writeAuditLog: vi.fn(),
  queueNotification: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/inngest', () => ({ inngest: { createFunction: () => ({}) } }))
vi.mock('@/lib/db', () => ({ db: { paymentMandate: { findMany: mocks.findMany, update: mocks.update } } }))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { getMandateStatus: mocks.getMandateStatus, mapMandateStatus: mocks.mapMandateStatus },
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: mocks.error, debug: vi.fn() },
}))

import { executeMandateStatusSync } from '@/inngest/functions/mandate-status-sync'

const step = { run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn() }

const mandate = (over: Record<string, unknown> = {}) => ({
  id: 'mandate-1', netcashMandateId: 'nc-1', status: 'ACTIVE', userId: 'user-1', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([mandate()])
  mocks.getMandateStatus.mockResolvedValue({ status: 'ACTIVE' })
  mocks.mapMandateStatus.mockReturnValue('ACTIVE')
  mocks.update.mockResolvedValue({})
  mocks.writeAuditLog.mockResolvedValue(undefined)
  mocks.queueNotification.mockResolvedValue(undefined)
})

describe('executeMandateStatusSync — a status it cannot read', () => {
  beforeEach(() => { mocks.mapMandateStatus.mockReturnValue(null) })

  it('leaves the mandate alone rather than moving it out of ACTIVE', async () => {
    // Both adapters used to guess — SUSPENDED on the real one, PENDING on the
    // mock — and either one silently stops the member being collected from.
    const summary = await executeMandateStatusSync(step)

    expect(mocks.update).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ unrecognised: 1, synced: 0, unchanged: 0 })
  })

  it('says so loudly, with the status it could not read', async () => {
    mocks.getMandateStatus.mockResolvedValue({ status: 'SOME_NEW_CODE' })

    await executeMandateStatusSync(step)

    expect(mocks.error).toHaveBeenCalledWith(
      expect.stringContaining('Unrecognised mandate status'),
      expect.objectContaining({ mandateId: 'mandate-1', gatewayStatus: 'SOME_NEW_CODE' }),
    )
  })

  it('writes no audit entry for a change it did not make', async () => {
    await executeMandateStatusSync(step)
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })
})

describe('executeMandateStatusSync — a status that changed', () => {
  it('records the transition at both ends', async () => {
    mocks.mapMandateStatus.mockReturnValue('SUSPENDED')

    const summary = await executeMandateStatusSync(step)

    expect(mocks.update).toHaveBeenCalledWith({ where: { id: 'mandate-1' }, data: { status: 'SUSPENDED' } })
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'MANDATE_STATUS_SYNCED',
        payload: expect.objectContaining({ previousStatus: 'ACTIVE', newStatus: 'SUSPENDED' }),
      }),
    )
    expect(summary).toMatchObject({ synced: 1 })
  })

  it('tells the member when their debit order was cancelled at the bank', async () => {
    // Otherwise their contributions stop and the first they hear of it is a gap
    // in the statement. mandate-cancelled was seeded and never sent by anything.
    mocks.mapMandateStatus.mockReturnValue('CANCELLED')

    await executeMandateStatusSync(step)

    expect(mocks.queueNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', templateSlug: 'mandate-cancelled' }),
    )
  })

  it('does not message anyone for an ordinary suspension', async () => {
    mocks.mapMandateStatus.mockReturnValue('SUSPENDED')

    await executeMandateStatusSync(step)

    expect(mocks.queueNotification).not.toHaveBeenCalled()
  })
})

describe('executeMandateStatusSync — everything else', () => {
  it('does nothing when the gateway agrees with us', async () => {
    const summary = await executeMandateStatusSync(step)

    expect(mocks.update).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ unchanged: 1, synced: 0 })
  })

  it('keeps going when one mandate cannot be reached', async () => {
    mocks.findMany.mockResolvedValue([mandate({ id: 'm1' }), mandate({ id: 'm2' }), mandate({ id: 'm3' })])
    mocks.getMandateStatus.mockImplementation((nc: string) =>
      nc === 'nc-1' ? Promise.resolve({ status: 'ACTIVE' }) : Promise.resolve({ status: 'ACTIVE' }),
    )
    let call = 0
    mocks.getMandateStatus.mockImplementation(() => {
      call++
      return call === 2 ? Promise.reject(new Error('gateway timeout')) : Promise.resolve({ status: 'ACTIVE' })
    })

    const summary = await executeMandateStatusSync(step)

    expect(summary).toMatchObject({ total: 3, failed: 1, unchanged: 2 })
    expect(mocks.warn).toHaveBeenCalled()
  })

  it('only looks at mandates that are not already terminal', async () => {
    await executeMandateStatusSync(step)

    const where = mocks.findMany.mock.calls[0][0].where
    expect(where.status).toEqual({ in: ['PENDING', 'ACTIVE', 'SUSPENDED'] })
    expect(where.netcashMandateId).toEqual({ not: null })
  })
})
