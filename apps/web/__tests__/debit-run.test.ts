import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ error: vi.fn() }))

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://test',
    AUTH_SECRET: 'test-secret',
    ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    WHATSAPP_GROUP_LINK: 'https://example.com',
    NEXTAUTH_URL: 'https://app.example.test',
  },
}))

vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.error, debug: vi.fn() },
}))

import { processMandateBatch } from '@/inngest/functions/debit-run'
import { toTransactionStatus } from '@/lib/transaction-status'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processMandateBatch', () => {
  it('continues processing later mandates after one throws', async () => {
    const calls: string[] = []

    const result = await processMandateBatch(['first', 'second', 'third'], async (mandate) => {
      calls.push(mandate)
      if (mandate === 'second') throw new Error('boom')
    })

    expect(result).toEqual({ succeeded: 2, failed: 1 })
    expect(calls).toEqual(['first', 'second', 'third'])
  })

  it('reports the failure through the logger, naming the mandate', async () => {
    // The failure used to go to console.error with no mandate in it — off the
    // error tracker, and unattributable once there.
    await processMandateBatch(
      [{ id: 'mandate-7' }],
      () => { throw new Error('gateway exploded') },
      (m) => m.id,
    )

    expect(mocks.error).toHaveBeenCalledWith(
      'Debit run: unexpected error processing a mandate',
      expect.objectContaining({ mandateId: 'mandate-7', reason: 'gateway exploded' }),
    )
  })
})

describe('toTransactionStatus', () => {
  it('keeps a decline distinct from a pending settlement', () => {
    // The bug this guards: FAILED was written as PENDING, so transaction-retry-failed
    // never saw it, the contribution waited on a webhook that was never coming,
    // and the member was told "pending" when the bank had declined them.
    expect(toTransactionStatus('FAILED')).toBe('FAILED')
    expect(toTransactionStatus('PENDING')).toBe('PENDING')
    expect(toTransactionStatus('SUCCESS')).toBe('SUCCESS')
  })
})
