import { describe, it, expect } from 'vitest'
import { mockGateway } from '@/integrations/payment/mock.adapter'

const debit = (over: Partial<{ reference: string; idempotencyKey: string }> = {}) => ({
  mandateId: 'nc-1',
  amount: 110,
  reference: 'XXM-2026-08',
  idempotencyKey: 'debit:run:m1:2026-08',
  ...over,
})

describe('the mock gateway is deterministic, so a failing test fails again', () => {
  it('gives the same answer for the same request', async () => {
    const a = await mockGateway.submitScheduledDebit(debit())
    const b = await mockGateway.submitScheduledDebit(debit())
    expect(a).toEqual(b)
  })

  it('gives different references to different requests', async () => {
    const a = await mockGateway.submitScheduledDebit(debit({ idempotencyKey: 'k1' }))
    const b = await mockGateway.submitScheduledDebit(debit({ idempotencyKey: 'k2' }))
    expect(a.transactionRef).not.toBe(b.transactionRef)
  })
})

describe('outcomes are steered by the reference, so every path can be exercised', () => {
  it('settles an ordinary debit', async () => {
    const res = await mockGateway.submitScheduledDebit(debit())
    expect(res.status).toBe('SUCCESS')
    expect(res.transactionRef).toMatch(/^MOCKTX-/)
  })

  it('declines on request, with a reason the caller can record', async () => {
    const res = await mockGateway.submitScheduledDebit(debit({ reference: 'XXM-DECLINE-TEST' }))
    expect(res.status).toBe('FAILED')
    expect(res.reason).toBe('Insufficient funds')
  })

  it('can hold a payment pending, which is the case webhook settlement exists for', async () => {
    const res = await mockGateway.submitOnceOffDebit(debit({ reference: 'XXM-PENDING-TEST' }))
    expect(res.status).toBe('PENDING')
    expect(res.transactionRef).toBeDefined()
  })

  it('can throw, so the unhappy path is reachable too', async () => {
    await expect(mockGateway.submitOnceOffDebit(debit({ reference: 'XXM-ERROR-TEST' })))
      .rejects.toThrow(/simulated gateway outage/)
  })

  it('steers on the idempotency key as well as the reference', async () => {
    const res = await mockGateway.submitScheduledDebit(debit({ idempotencyKey: 'debit:run:DECLINE:2026-08' }))
    expect(res.status).toBe('FAILED')
  })
})

describe('it refuses to authenticate anything', () => {
  // A mock that waved webhooks through would let a test pass while the real
  // signature check was broken, and would believe anyone who pointed a staging
  // webhook at it.
  it('never accepts a webhook signature', () => {
    expect(mockGateway.verifyWebhookSignature('{}', 'anything')).toBe(false)
    expect(mockGateway.verifyWebhookSignature('', '')).toBe(false)
  })

  it('never accepts a webhook IP', () => {
    expect(mockGateway.isAllowedWebhookIp('196.11.235.1')).toBe(false)
    expect(mockGateway.isAllowedWebhookIp('127.0.0.1')).toBe(false)
  })
})

describe('it mirrors the real adapter where behaviour is shared', () => {
  it('maps the transaction statuses the webhook handler branches on', () => {
    expect(mockGateway.mapTransactionStatus('SUCCESS')).toBe('SUCCESS')
    expect(mockGateway.mapTransactionStatus('FAILED')).toBe('FAILED')
    expect(mockGateway.mapTransactionStatus('REVERSED')).toBe('REVERSED')
    expect(mockGateway.mapTransactionStatus('SOMETHING_ELSE')).toBeNull()
  })

  it('treats an authorised mandate as active, as Netcash does', () => {
    expect(mockGateway.mapMandateStatus('AUTHORIZED')).toBe('ACTIVE')
    expect(mockGateway.mapMandateStatus('REJECTED')).toBe('SUSPENDED')
  })

  it('creates mandates pending, because the real one confirms by webhook', async () => {
    const res = await mockGateway.createMandate({
      accountNumber: '123', branchCode: '051001', accountType: 'Savings',
      accountName: 'K M', amount: 110, debitDay: 25,
      startDate: '2026-08-25', referenceNumber: 'XXM-1',
    })
    expect(res.status).toBe('PENDING')
    expect(res.mandateId).toMatch(/^MOCKMND-/)
  })

  it('returns the next debit date in the future', () => {
    const next = mockGateway.getNextDebitDate(25)
    expect(next).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(next).getTime()).toBeGreaterThan(Date.now() - 86_400_000)
  })
})
