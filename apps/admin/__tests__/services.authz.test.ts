import { describe, it, expect, vi, beforeEach } from 'vitest'

// Every table entry below calls a real exported function. None of them should
// reach the database, so the mock is deliberately hostile: any query that does
// get through throws rather than quietly returning undefined.
vi.mock('@/lib/db', () => {
  // Declared inside the factory: vi.mock is hoisted above every other statement,
  // so anything it closes over has to be created in here.
  const reject = () => { throw new Error('reached the database past the admin guard') }
  const model = new Proxy({}, { get: () => reject })
  return {
    db: new Proxy({}, { get: (_t, k) => (k === '$transaction' ? reject : model) }),
    Prisma: {},
  }
})
vi.mock('@/lib/signature-storage', () => ({
  storeSignaturePng: () => { throw new Error('reached storage past the admin guard') },
}))
// WEB_BASE_URL as well as `env`: the contributions service now reaches the web
// app through lib/api, which imports it by name. A mock missing an export the
// import list names fails at import time, before a single guard is tested.
vi.mock('@/lib/env', () => ({
  env: { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
  WEB_BASE_URL: 'http://web.test',
}))

import * as services from '@/lib/services'
import { AdminForbiddenError } from '@/lib/services'

const NOT_ADMIN = ['MEMBER']
const NOBODY: string[] = []

/**
 * Every exported entry point, with a plausible call. The roles argument sits in
 * the second position on functions that act on behalf of an admin and the first
 * on functions that only read, which is exactly the kind of inconsistency that
 * makes a hand-checked guard easy to get wrong.
 */
const CALLS: Array<[string, (roles: string[]) => Promise<unknown>]> = [
  ['listMembers',              (r) => services.listMembers(r)],
  ['getMemberDetail',          (r) => services.getMemberDetail(r, 'm1')],
  ['setMemberStatus',          (r) => services.setMemberStatus('a1', r, 'm1', 'ACTIVE')],
  ['unlockMember',             (r) => services.unlockMember('a1', r, 'm1')],
  ['listAllMandates',          (r) => services.listAllMandates(r)],
  ['approveMandate',           (r) => services.approveMandate('a1', r, 'mn1')],
  ['rejectMandate',            (r) => services.rejectMandate('a1', r, 'mn1')],
  ['listAllContributions',     (r) => services.listAllContributions(r, { month: 1, year: 2026 })],
  ['listTransactionsForContributions', (r) => services.listTransactionsForContributions(r, ['c1'])],
  ['generateContributions',    (r) => services.generateContributions('a1', r, 1, 2026)],
  ['previewGeneration',        (r) => services.previewGeneration(r, 1, 2026)],
  ['waiveContribution',        (r) => services.waiveContribution('a1', r, 'c1', 'A perfectly good reason')],
  ['recordPayment',            (r) => services.recordPayment('a1', r, 'c1', 40, 'Cash at the meeting')],
  // Both refuse before the fetch, not after. A console that forwards whatever a
  // non-admin submits is one misconfigured shared secret away from being the
  // hole, and the hostile db mock above cannot catch that — this one does not
  // touch the database at all.
  ['recordOfflinePaymentForMember', (r) => services.recordOfflinePaymentForMember({
    adminId: 'a1', adminRoles: r, userId: 'm1', amount: 40,
    periodMonth: 6, periodYear: 2026, reference: 'EFT 8231', receivedAt: new Date(),
  })],
  ['listPayableMembers',       (r) => services.listPayableMembers(r)],
  ['listFundableGoals',        (r) => services.listFundableGoals(r)],
  ['recordOfflineGoalPaymentForMember', (r) => services.recordOfflineGoalPaymentForMember({
    adminId: 'a1', adminRoles: r, userId: 'm1', goalId: 'g1', amount: 500,
    reference: 'EFT 4471', receivedAt: new Date(),
  })],
  ['getBroadcastAudience',     (r) => services.getBroadcastAudience(r)],
  ['correctMemberIdNumber',    (r) => services.correctMemberIdNumber('a1', r, 'm1', '9001015800088', 'Captured wrong at registration')],
  ['listAllGoals',             (r) => services.listAllGoals(r)],
  ['getGoalById',              (r) => services.getGoalById(r, 'g1')],
  ['updateGoal',               (r) => services.updateGoal('a1', r, 'g1', { title: 'x' })],
  ['createGoal',               (r) => services.createGoal('a1', r, { title: 'x', type: 'CUSTOM', targetAmount: 100, deadline: '2026-12-01' })],
  ['activateGoal',             (r) => services.activateGoal('a1', r, 'g1')],
  ['rejectGoal',               (r) => services.rejectGoal('a1', r, 'g1', 'Not a fit for the circle right now')],
  ['lockGoal',                 (r) => services.lockGoal('a1', r, 'g1')],
  ['recordGoalOutcome',        (r) => services.recordGoalOutcome('a1', r, 'g1', 'Bought the catering equipment')],
  ['setPrimaryGoal',           (r) => services.setPrimaryGoal('a1', r, 'g1')],
  ['deleteGoal',               (r) => services.deleteGoal('a1', r, 'g1')],
  ['recordGoalProgress',       (r) => services.recordGoalProgress('a1', r, 'g1', 100)],
  ['listAuditLogs',            (r) => services.listAuditLogs(r)],
  ['listInvitations',          (r) => services.listInvitations(r)],
  ['getMemberPlaces',          (r) => services.getMemberPlaces(r)],
  ['revokeInvitation',         (r) => services.revokeInvitation('a1', r, 'i1')],
  ['setMemberRole',            (r) => services.setMemberRole('a1', r, 'm1', 'ADMIN', true)],
  ['getMemberLoginHistory',    (r) => services.getMemberLoginHistory(r, 'm1')],
  ['getDashboardStats',        (r) => services.getDashboardStats(r)],
  ['getMonthlyReportSummary',  (r) => services.getMonthlyReportSummary(r, 1, 2026)],
  ['getNudgeOutcomes',         (r) => services.getNudgeOutcomes(r, 1, 2026)],
  ['getContributionsForExport',(r) => services.getContributionsForExport(r, 1, 2026)],
  ['listAllBadges',            (r) => services.listAllBadges(r)],
  ['getSignatureMetadata',     (r) => services.getSignatureMetadata('a1', r)],
  ['getLockStatus',            (r) => services.getLockStatus('a1', r)],
  ['getSignatureHistory',      (r) => services.getSignatureHistory('a1', r)],
  ['createSignature',          (r) => services.createSignature('a1', r, Buffer.from('x'), 'K M')],
  ['updateSignature',          (r) => services.updateSignature('a1', r, Buffer.from('x'), 'K M')],
  ['listDataRequests',         (r) => services.listDataRequests(r)],
  ['logDataRequest',           (r) => services.logDataRequest(r, 'a1', { requesterName: 'A', requesterEmail: 'a@b.co', kind: 'ACCESS', detail: 'x' })],
  ['startDataRequest',         (r) => services.startDataRequest(r, 'a1', 'd1')],
  ['closeDataRequest',         (r) => services.closeDataRequest(r, 'a1', 'd1', { status: 'COMPLETED', outcome: 'x' })],
  ['assessErasure',            (r) => services.assessErasure(r, 'u1')],
  ['eraseErasableData',        (r) => services.eraseErasableData(r, 'a1', { subjectId: 'u1', requestId: 'd1' })],
]

beforeEach(() => vi.clearAllMocks())

describe('every admin entry point refuses a non-admin', () => {
  // This is the test the 954-line file has to pass before it is split apart.
  // If the refactor drops an assertAdmin anywhere, this fails immediately
  // instead of shipping an unguarded mutation on the highest-privilege surface
  // in the system.
  for (const [name, call] of CALLS) {
    it(`${name} rejects a signed-in member`, async () => {
      await expect(call(NOT_ADMIN)).rejects.toBeInstanceOf(AdminForbiddenError)
    })

    it(`${name} rejects a caller with no roles`, async () => {
      await expect(call(NOBODY)).rejects.toBeInstanceOf(AdminForbiddenError)
    })
  }

  it('covers the whole exported surface, so a new function cannot be missed', () => {
    const exported = Object.entries(services)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
      // Error classes are exported alongside the functions.
      .filter((k) => !k.startsWith('Admin') && !k.startsWith('Signature'))

    const covered = new Set(CALLS.map(([n]) => n))
    expect([...exported].filter((n) => !covered.has(n))).toEqual([])
  })
})
