import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * What happens when a scheduled job gives up.
 *
 * Inngest retries and then stops. Stopping used to be the end of it — visible
 * in the Inngest dashboard and nowhere else. For the debit run that is the whole
 * system failing silently on the one night it matters: no collections, no
 * transactions, no member notifications, and no alert either, because every
 * alert this codebase raises is raised *by* the job that just died.
 */

const raiseAlert = vi.hoisted(() => vi.fn())
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: raiseAlert }))

import { alertOnFailure } from '@/inngest/on-failure'

const failureEvent = {
  data: { function_id: 'debit-run', run_id: '01HRUN', event: { name: 'xxm/debit.run' } },
}

beforeEach(() => {
  vi.clearAllMocks()
  raiseAlert.mockResolvedValue(undefined)
})

describe('a job that exhausted its retries', () => {
  it('raises a critical alert naming the job in words a person reads at 18:20', async () => {
    await alertOnFailure('The monthly debit run')({
      error: new Error('Neon connection reset'),
      event: failureEvent,
    })

    expect(raiseAlert).toHaveBeenCalledOnce()
    const alert = raiseAlert.mock.calls[0][0]
    expect(alert).toMatchObject({ code: 'SCHEDULED_JOB_FAILED', severity: 'critical' })
    expect(alert.title).toContain('The monthly debit run')
    expect(alert.body).toContain('Neon connection reset')
  })

  it('carries the ids needed to find the run afterwards', async () => {
    await alertOnFailure('The monthly debit run')({ error: new Error('x'), event: failureEvent })

    const alert = raiseAlert.mock.calls[0][0]
    expect(alert.payload).toMatchObject({ functionId: 'debit-run', runId: '01HRUN' })
    expect(alert.entityId).toBe('debit-run')
  })

  it('keeps the title plain, because it goes out as an SMS', async () => {
    // The reason can contain anything a stack trace contains, so it stays in
    // the body. One non-ASCII character in the title halves the SMS segment.
    await alertOnFailure('The monthly debit run')({
      error: new Error('connection — reset ✗'),
      event: failureEvent,
    })

    expect(raiseAlert.mock.calls[0][0].title).toMatch(/^[\x20-\x7E]+$/)
  })
})

describe('the failure context is not always well formed', () => {
  it('handles something thrown that is not an Error', async () => {
    await alertOnFailure('The notification flush worker')({ error: 'ECONNRESET', event: failureEvent })
    expect(raiseAlert.mock.calls[0][0].body).toContain('ECONNRESET')
  })

  it('still alerts when the event carries no ids at all', async () => {
    // The handler must not be the second thing that fails. Whatever arrives,
    // somebody is told the job stopped.
    await alertOnFailure('Nightly ledger reconciliation')({ error: new Error('boom') })

    expect(raiseAlert).toHaveBeenCalledOnce()
    expect(raiseAlert.mock.calls[0][0].payload).toMatchObject({
      functionId: 'unknown',
      runId: 'unknown',
    })
  })
})
