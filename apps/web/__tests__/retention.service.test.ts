import { describe, it, expect, vi, beforeEach } from 'vitest'

const counts = {
  loginHistory: vi.fn(),
  invitation: vi.fn(),
  notification: vi.fn(),
}

vi.mock('@/lib/db', () => ({
  db: {
    loginHistory: { count: (...a: unknown[]) => counts.loginHistory(...a) },
    invitation: { count: (...a: unknown[]) => counts.invitation(...a) },
    notification: { count: (...a: unknown[]) => counts.notification(...a) },
  },
}))

import { surveyRetention, RETENTION_DAYS } from '@/services/retention.service'

beforeEach(() => {
  counts.loginHistory.mockReset().mockResolvedValue(0)
  counts.invitation.mockReset().mockResolvedValue(0)
  counts.notification.mockReset().mockResolvedValue(0)
})

describe('the retention survey', () => {
  it('says nothing when nothing is past its period', async () => {
    // An empty array is the signal that there is no decision to take. A survey
    // that reported three zeroes every month would be a monthly alert nobody
    // reads, which is the same as no survey at all.
    expect(await surveyRetention()).toEqual([])
  })

  it('reports only the categories that have something in them', async () => {
    counts.loginHistory.mockResolvedValue(412)
    const findings = await surveyRetention()

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      category: 'Login history',
      count: 412,
      policyDays: RETENTION_DAYS.loginHistory,
    })
  })

  it('reports every category at once when several are due', async () => {
    counts.loginHistory.mockResolvedValue(10)
    counts.invitation.mockResolvedValue(3)
    counts.notification.mockResolvedValue(7)

    const findings = await surveyRetention()
    expect(findings.map((f) => f.count)).toEqual([10, 3, 7])
  })

  it('counts only invitations that can no longer become a member', async () => {
    // A PENDING invitation is live however old it looks — expiring it belongs to
    // invite-expiry. Counting one here would invite someone to delete a seat
    // that is still being held.
    await surveyRetention()

    const where = counts.invitation.mock.calls[0]?.[0]?.where
    expect(where.status).toEqual({ in: ['EXPIRED', 'REVOKED'] })
  })

  it('measures each category against its own cutoff', async () => {
    await surveyRetention()

    const loginCutoff = counts.loginHistory.mock.calls[0][0].where.createdAt.lt as Date
    const notifCutoff = counts.notification.mock.calls[0][0].where.createdAt.lt as Date

    // Notifications are kept longer than sign-in records, so their cutoff is the
    // older date. Getting these the wrong way round would quietly propose
    // deleting the thing with the stronger claim to being kept.
    expect(notifCutoff.getTime()).toBeLessThan(loginCutoff.getTime())
  })

  it('never deletes', async () => {
    // The whole design rests on this. If a delete or updateMany ever appears on
    // the mocked client, the service has grown a capability it must not have
    // until the retention periods are settled.
    counts.loginHistory.mockResolvedValue(999)
    const { db } = await import('@/lib/db')

    await surveyRetention()

    for (const model of ['loginHistory', 'invitation', 'notification'] as const) {
      expect(db[model]).not.toHaveProperty('delete')
      expect(db[model]).not.toHaveProperty('deleteMany')
    }
  })
})
