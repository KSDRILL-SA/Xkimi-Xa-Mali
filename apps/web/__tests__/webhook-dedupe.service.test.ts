import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: { processedWebhookEvent: { create: vi.fn(), deleteMany: vi.fn() } },
}))

import { db } from '@/lib/db'
import { webhookEventKey, claimWebhookEvent, releaseWebhookEvent } from '@/services/webhook-dedupe.service'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

beforeEach(() => vi.clearAllMocks())

describe('webhookEventKey', () => {
  it('is stable for the same body, so a redelivery produces the same key', () => {
    const body = '{"transactionRef":"tx-1","status":"SUCCESS"}'
    expect(webhookEventKey(body)).toBe(webhookEventKey(body))
  })

  it('differs for different bodies, so two real events are never conflated', () => {
    expect(webhookEventKey('{"a":1}')).not.toBe(webhookEventKey('{"a":2}'))
  })

  it('is sensitive to whitespace, because the provider signs the raw bytes', () => {
    expect(webhookEventKey('{"a":1}')).not.toBe(webhookEventKey('{"a": 1}'))
  })
})

describe('claimWebhookEvent', () => {
  it('grants the claim the first time an event is seen', async () => {
    mock(db.processedWebhookEvent.create).mockResolvedValue({} as never)

    await expect(claimWebhookEvent('netcash', 'key-1')).resolves.toBe(true)
    expect(db.processedWebhookEvent.create).toHaveBeenCalledWith({
      data: { source: 'netcash', eventKey: 'key-1' },
    })
  })

  it('refuses the claim on a redelivery', async () => {
    // The unique (source, eventKey) constraint is what makes this race-safe:
    // two concurrent redeliveries both attempt the insert and exactly one wins.
    mock(db.processedWebhookEvent.create).mockRejectedValue({ code: 'P2002' } as never)

    await expect(claimWebhookEvent('netcash', 'key-1')).resolves.toBe(false)
  })

  it('rethrows any other database error rather than reporting a redelivery', async () => {
    // Treating an outage as "already processed" would make the caller ack a
    // payment event it never handled, and the provider would never send it again.
    mock(db.processedWebhookEvent.create).mockRejectedValue({ code: 'P1001', message: 'db unreachable' } as never)

    await expect(claimWebhookEvent('netcash', 'key-1')).rejects.toMatchObject({ code: 'P1001' })
  })

  it('rethrows a plain Error, which carries no Prisma code at all', async () => {
    mock(db.processedWebhookEvent.create).mockRejectedValue(new Error('boom') as never)
    await expect(claimWebhookEvent('netcash', 'key-1')).rejects.toThrow('boom')
  })

  it('keeps sources apart, so the same key from two providers is two events', async () => {
    mock(db.processedWebhookEvent.create).mockResolvedValue({} as never)

    await claimWebhookEvent('netcash', 'shared-key')
    await claimWebhookEvent('bulksms', 'shared-key')

    expect(db.processedWebhookEvent.create).toHaveBeenNthCalledWith(1, { data: { source: 'netcash', eventKey: 'shared-key' } })
    expect(db.processedWebhookEvent.create).toHaveBeenNthCalledWith(2, { data: { source: 'bulksms', eventKey: 'shared-key' } })
  })
})

describe('releaseWebhookEvent', () => {
  it('frees the claim so a genuine retry can be reprocessed', async () => {
    mock(db.processedWebhookEvent.deleteMany).mockResolvedValue({ count: 1 } as never)

    await releaseWebhookEvent('netcash', 'key-1')

    expect(db.processedWebhookEvent.deleteMany).toHaveBeenCalledWith({
      where: { source: 'netcash', eventKey: 'key-1' },
    })
  })

  it('is safe to call for an event that was never claimed', async () => {
    mock(db.processedWebhookEvent.deleteMany).mockResolvedValue({ count: 0 } as never)
    await expect(releaseWebhookEvent('netcash', 'never-seen')).resolves.toBeUndefined()
  })
})
