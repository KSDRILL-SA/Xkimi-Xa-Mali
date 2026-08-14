import { describe, it, expect, vi, beforeEach } from 'vitest'

const findMany = vi.fn()

vi.mock('@/lib/db', () => ({
  db: { dataSubjectRequest: { findMany: (...a: unknown[]) => findMany(...a) } },
}))

import { surveyDsrDeadlines, WARN_WITHIN_DAYS } from '@/services/dsr-deadline.service'

const NOW = new Date('2026-06-01T09:00:00Z')

function row(id: string, dueAt: string, kind = 'ACCESS', status = 'RECEIVED') {
  return { id, kind, status, dueAt: new Date(dueAt) }
}

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([])
})

describe('the deadline survey', () => {
  it('is silent when nothing is due', async () => {
    expect(await surveyDsrDeadlines(NOW)).toEqual({ breached: [], approaching: [] })
  })

  it('looks only at requests still awaiting an answer', async () => {
    await surveyDsrDeadlines(NOW)
    const where = findMany.mock.calls[0][0].where
    // A completed request has no deadline left to miss, and a refused one was
    // answered — reporting either would be reporting work already done.
    expect(where.status).toEqual({ in: ['RECEIVED', 'IN_PROGRESS'] })
  })

  it('looks ahead exactly as far as the warning window', async () => {
    await surveyDsrDeadlines(NOW)
    const horizon = findMany.mock.calls[0][0].where.dueAt.lt as Date
    expect(horizon.getTime() - NOW.getTime()).toBe(WARN_WITHIN_DAYS * 86_400_000)
  })

  it('separates a missed deadline from an approaching one', async () => {
    findMany.mockResolvedValue([
      row('late', '2026-05-25T09:00:00Z'),
      row('soon', '2026-06-06T09:00:00Z'),
    ])
    const { breached, approaching } = await surveyDsrDeadlines(NOW)
    expect(breached.map((f) => f.id)).toEqual(['late'])
    expect(approaching.map((f) => f.id)).toEqual(['soon'])
  })

  it('counts how late a missed one is, as a negative', async () => {
    findMany.mockResolvedValue([row('late', '2026-05-25T09:00:00Z')])
    const { breached } = await surveyDsrDeadlines(NOW)
    expect(breached[0].daysLeft).toBe(-7)
  })

  it('counts how long is left on one still in time', async () => {
    findMany.mockResolvedValue([row('soon', '2026-06-06T09:00:00Z')])
    const { approaching } = await surveyDsrDeadlines(NOW)
    expect(approaching[0].daysLeft).toBe(5)
  })

  it('treats a request due today as still answerable', async () => {
    // Day zero is not a breach. The Act gives thirty days, and the thirtieth is
    // one of them.
    findMany.mockResolvedValue([row('today', '2026-06-01T17:00:00Z')])
    const { breached, approaching } = await surveyDsrDeadlines(NOW)
    expect(breached).toHaveLength(0)
    expect(approaching[0].daysLeft).toBe(0)
  })

  it('reports the deadline as a plain date string, not a Date', async () => {
    // This survey is called inside an Inngest `step.run`, which round-trips its
    // result through JSON. A `Date` in the return type would still be typed as a
    // Date on the far side while actually being a string, and the first
    // `.toISOString()` on it would throw in production rather than in CI.
    findMany.mockResolvedValue([row('soon', '2026-06-06T09:00:00Z')])
    const { approaching } = await surveyDsrDeadlines(NOW)

    expect(approaching[0].dueOn).toBe('2026-06-06')
    expect(typeof approaching[0].dueOn).toBe('string')
    // What survives JSON is what the alert will actually render.
    expect(JSON.parse(JSON.stringify(approaching))[0].dueOn).toBe('2026-06-06')
  })

  it('asks the database for the closest deadline first', async () => {
    await surveyDsrDeadlines(NOW)
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ dueAt: 'asc' })
  })

  it('never reads the requester or what they asked for', async () => {
    // This survey becomes an alert sent by email to every administrator. It
    // needs to say that a request is due, not what is in it.
    await surveyDsrDeadlines(NOW)
    const select = findMany.mock.calls[0][0].select
    expect(select).toEqual({ id: true, kind: true, status: true, dueAt: true })
    expect(select.detail).toBeUndefined()
    expect(select.requesterName).toBeUndefined()
    expect(select.requesterEmail).toBeUndefined()
  })

  it('never writes', async () => {
    const { db } = (await import('@/lib/db')) as unknown as { db: Record<string, unknown> }
    const dsr = db.dataSubjectRequest as Record<string, unknown>
    expect(dsr.update).toBeUndefined()
    expect(dsr.delete).toBeUndefined()
    expect(dsr.create).toBeUndefined()
  })
})
