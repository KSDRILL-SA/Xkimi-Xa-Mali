import { describe, it, expect, vi, beforeEach } from 'vitest'

const { dsr, auditCreate } = vi.hoisted(() => ({
  dsr: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
  auditCreate: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    dataSubjectRequest: dsr,
    auditLog: { create: auditCreate },
  },
  Prisma: {},
}))

import {
  logDataRequest,
  startDataRequest,
  closeDataRequest,
  dueDateFor,
  DSR_RESPONSE_DAYS,
} from '@/lib/services/data-requests'
import { AdminConflictError, AdminNotFoundError } from '@/lib/services/shared'

const ADMIN = ['ADMIN']
const ADMIN_ID = 'admin-1'

/**
 * The first argument of the first call, or a clear failure.
 *
 * `noUncheckedIndexedAccess` is on, so indexing a mock's call list yields
 * `T | undefined`. Asserting here rather than at each use keeps the cases about
 * what was written, and turns "no call was made" into a readable failure instead
 * of a type error or a confusing `undefined` mismatch.
 */
function firstArg(mock: { mock: { calls: unknown[][] } }, what: string) {
  const call = mock.mock.calls[0]
  if (!call) throw new Error(`expected ${what} to have been called, but it was not`)
  return call[0] as { data: Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  dsr.create.mockImplementation(({ data }: { data: unknown }) => ({ id: 'dsr-1', ...(data as object) }))
  dsr.update.mockImplementation(({ data }: { data: unknown }) => ({ id: 'dsr-1', ...(data as object) }))
  auditCreate.mockResolvedValue({})
})

describe('the statutory clock', () => {
  it('is thirty days from when they asked', () => {
    const received = new Date('2026-03-01T09:00:00Z')
    const due = dueDateFor(received)

    expect(DSR_RESPONSE_DAYS).toBe(30)
    expect(Math.round((due.getTime() - received.getTime()) / 86_400_000)).toBe(30)
  })

  it('runs from when the request arrived, not when it was written down', async () => {
    // A request that sat in an inbox for a week has one week less, not a fresh
    // thirty days. Backdating the receipt is the whole reason receivedAt is an
    // input rather than always now().
    const lastWeek = new Date(Date.now() - 7 * 86_400_000)

    await logDataRequest(ADMIN, ADMIN_ID, {
      requesterName: 'A Member',
      requesterEmail: 'a@example.com',
      kind: 'ACCESS',
      detail: 'Everything you hold',
      receivedAt: lastWeek,
    })

    const { receivedAt, dueAt } = firstArg(dsr.create, 'create').data as unknown as { receivedAt: Date; dueAt: Date }
    expect(receivedAt).toBe(lastWeek)
    expect(dueAt.getTime()).toBe(dueDateFor(lastWeek).getTime())
    // Only 23 days remain, not 30.
    expect(dueAt.getTime() - Date.now()).toBeLessThan(24 * 86_400_000)
  })
})

describe('logging a request', () => {
  it('normalises the email so the same person is not two requesters', async () => {
    await logDataRequest(ADMIN, ADMIN_ID, {
      requesterName: '  A Member  ',
      requesterEmail: '  A.Member@Example.COM ',
      kind: 'DELETION',
      detail: '  delete me  ',
    })

    expect(firstArg(dsr.create, 'create').data).toMatchObject({
      requesterName: 'A Member',
      requesterEmail: 'a.member@example.com',
      detail: 'delete me',
    })
  })

  it('accepts a requester who is not a member', async () => {
    // Someone invited who never joined still has an encrypted ID number here,
    // and the strongest claim of anyone to have it removed.
    await logDataRequest(ADMIN, ADMIN_ID, {
      requesterName: 'Never Joined',
      requesterEmail: 'nj@example.com',
      kind: 'DELETION',
      detail: 'I never signed up',
    })

    expect(firstArg(dsr.create, 'create').data.subjectId).toBeNull()
  })

  it('records the logging in the audit trail', async () => {
    await logDataRequest(ADMIN, ADMIN_ID, {
      requesterName: 'A', requesterEmail: 'a@b.co', kind: 'ACCESS', detail: 'x',
    })

    expect(firstArg(auditCreate, 'the audit log').data).toMatchObject({
      userId: ADMIN_ID,
      action: 'DSR_LOGGED',
      entity: 'DataSubjectRequest',
    })
  })
})

describe('closing a request', () => {
  const OPEN = {
    id: 'dsr-1',
    status: 'IN_PROGRESS',
    receivedAt: new Date('2026-03-01T00:00:00Z'),
    dueAt: new Date('2026-03-31T00:00:00Z'),
    handledById: ADMIN_ID,
  }

  it('will not refuse without recorded reasons', async () => {
    dsr.findUnique.mockResolvedValue(OPEN)

    await expect(
      closeDataRequest(ADMIN, ADMIN_ID, 'dsr-1', { status: 'REFUSED', outcome: '   ' }),
    ).rejects.toBeInstanceOf(AdminConflictError)

    expect(dsr.update).not.toHaveBeenCalled()
  })

  it('will not complete without recording what was given back', async () => {
    // A completed request with no record of the answer is indistinguishable
    // later from one that was quietly dropped.
    dsr.findUnique.mockResolvedValue(OPEN)

    await expect(
      closeDataRequest(ADMIN, ADMIN_ID, 'dsr-1', { status: 'COMPLETED', outcome: '' }),
    ).rejects.toBeInstanceOf(AdminConflictError)
  })

  it('records whether the answer was inside the statutory period', async () => {
    vi.setSystemTime(new Date('2026-03-20T00:00:00Z'))
    dsr.findUnique.mockResolvedValue(OPEN)

    await closeDataRequest(ADMIN, ADMIN_ID, 'dsr-1', {
      status: 'COMPLETED',
      outcome: 'Full export sent',
    })

    expect(firstArg(auditCreate, 'the audit log').data.payload).toMatchObject({
      withinStatutoryPeriod: true,
      daysTaken: 19,
    })
    vi.useRealTimers()
  })

  it('records a late answer as late', async () => {
    vi.setSystemTime(new Date('2026-04-15T00:00:00Z'))
    dsr.findUnique.mockResolvedValue(OPEN)

    await closeDataRequest(ADMIN, ADMIN_ID, 'dsr-1', {
      status: 'COMPLETED',
      outcome: 'Sent, late',
    })

    const payload = firstArg(auditCreate, 'the audit log').data.payload as { withinStatutoryPeriod: boolean }
    expect(payload.withinStatutoryPeriod).toBe(false)
    vi.useRealTimers()
  })

  it('refuses to close an already-closed request', async () => {
    dsr.findUnique.mockResolvedValue({ ...OPEN, status: 'COMPLETED' })

    await expect(
      closeDataRequest(ADMIN, ADMIN_ID, 'dsr-1', { status: 'COMPLETED', outcome: 'again' }),
    ).rejects.toBeInstanceOf(AdminConflictError)
  })

  it('reports a missing request rather than creating one', async () => {
    dsr.findUnique.mockResolvedValue(null)

    await expect(
      closeDataRequest(ADMIN, ADMIN_ID, 'nope', { status: 'COMPLETED', outcome: 'x' }),
    ).rejects.toBeInstanceOf(AdminNotFoundError)
  })
})

describe('starting a request', () => {
  it('only moves one that has just been received', async () => {
    dsr.findUnique.mockResolvedValue({ id: 'dsr-1', status: 'IN_PROGRESS' })

    await expect(startDataRequest(ADMIN, ADMIN_ID, 'dsr-1')).rejects.toBeInstanceOf(
      AdminConflictError,
    )
  })

  it('claims the request for the admin who started it', async () => {
    dsr.findUnique.mockResolvedValue({ id: 'dsr-1', status: 'RECEIVED' })

    await startDataRequest(ADMIN, ADMIN_ID, 'dsr-1')

    expect(firstArg(dsr.update, 'update').data).toMatchObject({
      status: 'IN_PROGRESS',
      handledById: ADMIN_ID,
    })
  })
})

describe('authorisation', () => {
  it('refuses a caller without the admin role', async () => {
    await expect(
      logDataRequest([], 'someone', {
        requesterName: 'A', requesterEmail: 'a@b.co', kind: 'ACCESS', detail: 'x',
      }),
    ).rejects.toThrow()

    expect(dsr.create).not.toHaveBeenCalled()
  })
})
