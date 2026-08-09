import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/encryption', () => ({
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, '')),
  maskStoredSecret: vi.fn((v: string) => {
    const plain = v.replace(/^enc:/, '')
    return plain.slice(-4).padStart(plain.length, '*')
  }),
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/redis', () => ({ redis: { set: vi.fn().mockResolvedValue('OK') } }))
vi.mock('@/lib/inngest', () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
  InngestEvents: { MANDATE_DELAY_HANDLER: 'xxm/mandate.delay-handler' },
}))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: {
    createMandate: vi.fn(),
    cancelMandate: vi.fn().mockResolvedValue(undefined),
    updateMandate: vi.fn().mockResolvedValue(undefined),
    delayMandate: vi.fn().mockResolvedValue(undefined),
    getNextDebitDate: vi.fn().mockReturnValue('2026-08-01'),
    mapMandateStatus: vi.fn((s: string) => s),
  },
}))
vi.mock('@/repositories/mandate.repository', () => ({
  mandateRepo: { findFirst: vi.fn(), findById: vi.fn(), create: vi.fn(), update: vi.fn(), findActiveByUser: vi.fn(), findMany: vi.fn() },
}))
vi.mock('@/repositories/user.repository', () => ({
  userRepo: { findById: vi.fn(), update: vi.fn() },
}))
vi.mock('@/lib/role-version', () => ({ bumpRoleVersion: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/inbox.service', () => ({ notifyAdmins: vi.fn().mockResolvedValue(0) }))
// A gateway sync failure now raises an operational alert rather than only
// logging. Mocked here so this suite does not pull the alert service's whole
// dependency chain (env, db, email, SMS) in behind it.
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/repositories/bank-account.repository', () => ({
  bankAccountRepo: { findById: vi.fn() },
}))

import { paymentGateway } from '@/integrations/payment'
import { mandateRepo } from '@/repositories/mandate.repository'
import { bankAccountRepo } from '@/repositories/bank-account.repository'
import { userRepo } from '@/repositories/user.repository'
import { bumpRoleVersion } from '@/lib/role-version'
import { notifyAdmins } from '@/services/inbox.service'
import {
  createMandate,
  cancelMandate,
  leaveFoundation,
  processMandateWebhook,
  planDebitWarnings,
  hasActiveMandate,
  requestDelay,
} from '@/services/mandate.service'
import { MandateConflictError } from '@/lib/errors'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

const OWNER = 'user-1'
const bankAccount = {
  id: 'ba-1',
  userId: OWNER,
  accountNumber: 'enc:1234567890',
  accountType: 'SAVINGS',
  branchCode: '250655',
  user: { firstName: 'Test', lastName: 'User', idNumber: 'enc:9001015800080' },
}
const createInput = { bankAccountId: 'ba-1', amount: 500, debitDay: 1 }

beforeEach(() => vi.clearAllMocks())

describe('createMandate — single active mandate invariant', () => {
  it('rejects up front when an active or pending mandate already exists', async () => {
    mock(mandateRepo.findFirst).mockResolvedValue({ id: 'm-existing' } as never)

    await expect(createMandate(OWNER, createInput, OWNER, ['MEMBER']))
      .rejects.toBeInstanceOf(MandateConflictError)
    // Never reaches the gateway if the pre-check trips.
    expect(paymentGateway.createMandate).not.toHaveBeenCalled()
  })

  it('translates a DB unique violation (lost race) into a conflict and cancels the orphaned Netcash mandate', async () => {
    mock(mandateRepo.findFirst).mockResolvedValue(null as never)
    mock(bankAccountRepo.findById).mockResolvedValue(bankAccount as never)
    mock(paymentGateway.createMandate).mockResolvedValue({ mandateId: 'nc-1', status: 'PENDING' } as never)
    // A concurrent request already inserted the one allowed mandate.
    mock(mandateRepo.create).mockRejectedValue({ code: 'P2002' } as never)

    await expect(createMandate(OWNER, createInput, OWNER, ['MEMBER']))
      .rejects.toBeInstanceOf(MandateConflictError)
    // The live DebiCheck mandate must be cancelled so it is not orphaned.
    expect(paymentGateway.cancelMandate).toHaveBeenCalledWith('nc-1')
  })

  it('cancels the Netcash mandate and rethrows on a non-uniqueness DB error', async () => {
    mock(mandateRepo.findFirst).mockResolvedValue(null as never)
    mock(bankAccountRepo.findById).mockResolvedValue(bankAccount as never)
    mock(paymentGateway.createMandate).mockResolvedValue({ mandateId: 'nc-2', status: 'PENDING' } as never)
    mock(mandateRepo.create).mockRejectedValue({ code: 'P1001', message: 'db down' } as never)

    await expect(createMandate(OWNER, createInput, OWNER, ['MEMBER'])).rejects.toMatchObject({ code: 'P1001' })
    expect(paymentGateway.cancelMandate).toHaveBeenCalledWith('nc-2')
  })

  it('persists the status Netcash actually returned (not an assumed PENDING)', async () => {
    mock(mandateRepo.findFirst).mockResolvedValue(null as never)
    mock(bankAccountRepo.findById).mockResolvedValue(bankAccount as never)
    mock(paymentGateway.createMandate).mockResolvedValue({ mandateId: 'nc-3', status: 'REJECTED' } as never)
    mock(paymentGateway.mapMandateStatus).mockReturnValue('SUSPENDED' as never)
    mock(mandateRepo.create).mockResolvedValue({ id: 'm-3' } as never)

    await createMandate(OWNER, createInput, OWNER, ['MEMBER'])

    expect(mandateRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'SUSPENDED', netcashMandateId: 'nc-3' }),
    )
  })
})

describe('processMandateWebhook — idempotent, terminal-safe', () => {
  it('is a no-op for an unknown mandate id', async () => {
    mock(mandateRepo.findFirst).mockResolvedValue(null as never)
    await processMandateWebhook({ mandateId: 'nope', status: 'ACTIVE' } as never)
    expect(mandateRepo.update).not.toHaveBeenCalled()
  })

  it('never revives a CANCELLED mandate (terminal state protection)', async () => {
    mock(mandateRepo.findFirst).mockResolvedValue({ id: 'm1', status: 'CANCELLED' } as never)
    mock(paymentGateway.mapMandateStatus).mockReturnValue('ACTIVE' as never)

    await processMandateWebhook({ mandateId: 'nc-1', status: 'ACTIVE' } as never)

    expect(mandateRepo.update).not.toHaveBeenCalled()
  })

  it('is a no-op when the mapped status is unchanged (redelivery idempotency)', async () => {
    mock(mandateRepo.findFirst).mockResolvedValue({ id: 'm1', status: 'ACTIVE' } as never)
    mock(paymentGateway.mapMandateStatus).mockReturnValue('ACTIVE' as never)

    await processMandateWebhook({ mandateId: 'nc-1', status: 'ACTIVE' } as never)

    expect(mandateRepo.update).not.toHaveBeenCalled()
  })

  it('updates the mandate when the status genuinely changes', async () => {
    mock(mandateRepo.findFirst).mockResolvedValue({ id: 'm1', status: 'PENDING' } as never)
    mock(paymentGateway.mapMandateStatus).mockReturnValue('ACTIVE' as never)
    mock(mandateRepo.update).mockResolvedValue({} as never)

    await processMandateWebhook({ mandateId: 'nc-1', status: 'ACTIVE' } as never)

    expect(mandateRepo.update).toHaveBeenCalledWith('m1', { status: 'ACTIVE' })
  })
})

describe('cancelMandate', () => {
  it('rejects a mandate that is already cancelled', async () => {
    mock(mandateRepo.findById).mockResolvedValue({ id: 'm1', userId: OWNER, status: 'CANCELLED' } as never)

    await expect(cancelMandate('m1', OWNER, ['MEMBER'])).rejects.toBeInstanceOf(MandateConflictError)
    expect(mandateRepo.update).not.toHaveBeenCalled()
  })

  it('cancels in the DB first, then notifies Netcash', async () => {
    mock(mandateRepo.findById).mockResolvedValue({
      id: 'm1', userId: OWNER, status: 'ACTIVE', netcashMandateId: 'nc-1',
    } as never)
    mock(mandateRepo.update).mockResolvedValue({ id: 'm1', status: 'CANCELLED' } as never)

    await cancelMandate('m1', OWNER, ['MEMBER'])

    expect(mandateRepo.update).toHaveBeenCalledWith('m1', { status: 'CANCELLED' })
    expect(paymentGateway.cancelMandate).toHaveBeenCalledWith('nc-1')
  })
})

describe('planDebitWarnings', () => {
  const mandate = (id: string, userId: string, userStatus = 'ACTIVE') => ({ id, userId, amount: 500, userStatus })

  it('warns active, unsettled members and flags at-risk ones', () => {
    const targets = planDebitWarnings(
      [mandate('m1', 'u1'), mandate('m2', 'u2')],
      new Set<string>(),
      new Set(['u2']),
    )
    expect(targets).toEqual([
      { mandateId: 'm1', userId: 'u1', amount: 500, atRisk: false },
      { mandateId: 'm2', userId: 'u2', amount: 500, atRisk: true },
    ])
  })

  it('skips a member already settled for the period (no debit will run)', () => {
    const targets = planDebitWarnings(
      [mandate('m1', 'u1'), mandate('m2', 'u2')],
      new Set(['u1']),
      new Set<string>(),
    )
    expect(targets.map((t) => t.userId)).toEqual(['u2'])
  })

  it('skips a suspended member', () => {
    const targets = planDebitWarnings(
      [mandate('m1', 'u1', 'SUSPENDED')],
      new Set<string>(),
      new Set<string>(),
    )
    expect(targets).toEqual([])
  })

  it('returns nothing when there are no mandates', () => {
    expect(planDebitWarnings([], new Set<string>(), new Set<string>())).toEqual([])
  })
})

describe('hasActiveMandate — the precondition for member-initiated payments', () => {
  it('is true when the member has an active mandate', async () => {
    mock(mandateRepo.findActiveByUser).mockResolvedValue({ id: 'm1' } as never)
    await expect(hasActiveMandate(OWNER, OWNER, ['MEMBER'])).resolves.toBe(true)
  })

  it('is false when the member has none', async () => {
    mock(mandateRepo.findActiveByUser).mockResolvedValue(null as never)
    await expect(hasActiveMandate(OWNER, OWNER, ['MEMBER'])).resolves.toBe(false)
  })

  it('reads only the id — no bank details are loaded or decrypted', async () => {
    mock(mandateRepo.findActiveByUser).mockResolvedValue({ id: 'm1' } as never)
    await hasActiveMandate(OWNER, OWNER, ['MEMBER'])
    expect(mandateRepo.findActiveByUser).toHaveBeenCalledWith(OWNER, { id: true })
  })

  it('refuses to answer for another member', async () => {
    await expect(hasActiveMandate(OWNER, 'someone-else', ['MEMBER'])).rejects.toThrow()
    expect(mandateRepo.findActiveByUser).not.toHaveBeenCalled()
  })
})

describe('a delay the member asked for is honoured', () => {
  const m = (over: Record<string, unknown> = {}) => ({
    id: 'm1', userId: 'u1', amount: 500, userStatus: 'ACTIVE', ...over,
  })
  const NOW = new Date('2026-08-25T18:00:00.000Z')
  const none = new Set<string>()

  it('skips a mandate moved to a future date', async () => {
    // Previously this lived in a Redis key, so with no cache configured the
    // delay was invisible and the member was debited on the original date.
    const targets = planDebitWarnings(
      [m({ delayedUntil: new Date('2026-09-05T00:00:00.000Z') })], none, none, NOW,
    )
    expect(targets).toEqual([])
  })

  it('accepts the date as a string, which is how it crosses a step boundary', () => {
    // Inngest serialises step results to JSON, so a Date arrives as a string.
    const targets = planDebitWarnings([m({ delayedUntil: '2026-09-05T00:00:00.000Z' })], none, none, NOW)
    expect(targets).toEqual([])
  })

  it('warns again once the delay date has passed', () => {
    const targets = planDebitWarnings(
      [m({ delayedUntil: new Date('2026-08-01T00:00:00.000Z') })], none, none, NOW,
    )
    expect(targets).toHaveLength(1)
  })

  it('warns a member who never asked for a delay', () => {
    expect(planDebitWarnings([m({ delayedUntil: null })], none, none, NOW)).toHaveLength(1)
    expect(planDebitWarnings([m()], none, none, NOW)).toHaveLength(1)
  })

  it('still skips a settled member regardless of any delay', () => {
    expect(planDebitWarnings([m()], new Set(['u1']), none, NOW)).toEqual([])
  })
})

describe('requestDelay writes the delay where it cannot be lost', () => {
  const FUTURE = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

  beforeEach(() => {
    mock(mandateRepo.findById).mockResolvedValue({
      id: 'm1', userId: OWNER, status: 'ACTIVE', debitDay: 25, netcashMandateId: 'nc-1',
    } as never)
    mock(mandateRepo.update).mockResolvedValue({} as never)
  })

  it('persists the new date on the mandate', async () => {
    await requestDelay('m1', { newDate: FUTURE }, OWNER, ['MEMBER'])

    expect(mandateRepo.update).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ delayedUntil: new Date(FUTURE) }),
    )
  })

  it('tells the gateway as well as recording it', async () => {
    await requestDelay('m1', { newDate: FUTURE }, OWNER, ['MEMBER'])
    expect(paymentGateway.delayMandate).toHaveBeenCalledWith('nc-1', FUTURE)
  })

  it('refuses a date in the past, before touching anything', async () => {
    await expect(requestDelay('m1', { newDate: '2020-01-01' }, OWNER, ['MEMBER'])).rejects.toThrow()
    expect(mandateRepo.update).not.toHaveBeenCalled()
  })
})


// ---------------------------------------------------------------------------
// leaveFoundation — "Leave the Foundation at any time, with your history intact"
// ---------------------------------------------------------------------------

describe('leaveFoundation', () => {
  const member = (over: Record<string, unknown> = {}) => ({
    id: 'u1', status: 'ACTIVE', firstName: 'Thabo', lastName: 'Mahlangu', ...over,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mock(userRepo.findById).mockResolvedValue(member() as never)
    mock(userRepo.update).mockResolvedValue({ id: 'u1', firstName: 'Thabo', lastName: 'Mahlangu' } as never)
    mock(mandateRepo.findMany).mockResolvedValue([] as never)
  })

  it('moves the member out of ACTIVE and stamps when they left', async () => {
    const result = await leaveFoundation('u1', '127.0.0.1')

    // Every collection path filters on ACTIVE, so moving out of it is what
    // stops future debits. That is the existing mechanism, not a new one.
    expect(userRepo.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ status: 'RESIGNED', resignedAt: expect.any(Date) }),
      expect.anything(),
    )
    expect(result.resignedAt).toBeTruthy()
  })

  it('cancels every live mandate at the gateway', async () => {
    mock(mandateRepo.findMany).mockResolvedValue([
      { id: 'm1', userId: 'u1', status: 'ACTIVE', netcashMandateId: 'nc1' },
      { id: 'm2', userId: 'u1', status: 'PENDING', netcashMandateId: null },
    ] as never)
    mock(mandateRepo.findById).mockImplementation((async (id: string) => ({
      id, userId: 'u1', status: 'ACTIVE', netcashMandateId: id === 'm1' ? 'nc1' : null,
    })) as never)
    mock(mandateRepo.update).mockResolvedValue({} as never)

    const result = await leaveFoundation('u1', '127.0.0.1')

    expect(result.mandatesCancelled).toBe(2)
    expect(mock(paymentGateway.cancelMandate)).toHaveBeenCalledWith('nc1')
  })

  it('leaves anyway when the gateway will not co-operate', async () => {
    mock(mandateRepo.findMany).mockResolvedValue([
      { id: 'm1', userId: 'u1', status: 'ACTIVE', netcashMandateId: 'nc1' },
    ] as never)
    mock(mandateRepo.findById).mockRejectedValue(new Error('gateway down'))

    // The member said they are leaving. A gateway outage must not hold them in.
    await expect(leaveFoundation('u1', '127.0.0.1')).resolves.toBeDefined()
    expect(userRepo.update).toHaveBeenCalled()
  })

  it('ends the session by invalidating the role version', async () => {
    await leaveFoundation('u1', '127.0.0.1')

    // Their token was issued while they were still active.
    expect(mock(bumpRoleVersion)).toHaveBeenCalledWith('u1')
  })

  it('tells leadership after the fact rather than asking first', async () => {
    await leaveFoundation('u1', '127.0.0.1')

    // The guide says "at any time". Making it conditional on a leader reading
    // an inbox would make that untrue.
    expect(mock(notifyAdmins)).toHaveBeenCalled()
    const msg = mock(notifyAdmins).mock.calls[0]![0] as { body: string }
    expect(msg.body).toMatch(/history remains on record/i)
  })

  it('refuses a member who has already left', async () => {
    mock(userRepo.findById).mockResolvedValue(member({ status: 'RESIGNED' }) as never)

    await expect(leaveFoundation('u1', '127.0.0.1')).rejects.toBeInstanceOf(MandateConflictError)
    expect(userRepo.update).not.toHaveBeenCalled()
  })

  it('deletes nothing', async () => {
    await leaveFoundation('u1', '127.0.0.1')

    // The guide is explicit: history stays and contributions already made are
    // not refunded. Nothing in this path removes a row.
    const data = mock(userRepo.update).mock.calls[0]![1] as Record<string, unknown>
    expect(data).not.toHaveProperty('deletedAt')
  })
})
