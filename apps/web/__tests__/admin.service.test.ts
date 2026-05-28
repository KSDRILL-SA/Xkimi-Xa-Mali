import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    paymentMandate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    contribution: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    goal: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock('@/lib/bulksms', () => ({
  sendSMS: vi.fn(),
  normalisePhone: vi.fn((p: string) => p),
}))

vi.mock('@/lib/email', () => ({
  sendWelcomeEmail: vi.fn(),
}))

vi.mock('@/services/contribution.service', () => ({
  generateMonthlyContributions: vi.fn(),
}))

vi.mock('@/services/audit.service', () => ({
  writeAuditLog: vi.fn(),
}))

import { db } from '@/lib/db'
import { writeAuditLog } from '@/services/audit.service'
import { generateMonthlyContributions } from '@/services/contribution.service'
import { sendSMS } from '@/lib/bulksms'
import { sendWelcomeEmail } from '@/lib/email'
import {
  listMembers,
  getMemberDetail,
  setMemberStatus,
  approveMandate,
  rejectMandate,
  listAllMandates,
  listAllContributions,
  bulkGenerateContributions,
  broadcastNotification,
  listAuditLogs,
  listAllGoals,
  AdminForbiddenError,
  AdminNotFoundError,
  AdminConflictError,
} from '@/services/admin.service'

const mockDb = db as {
  user: {
    findMany: MockedFunction<typeof db.user.findMany>
    findUnique: MockedFunction<typeof db.user.findUnique>
    count: MockedFunction<typeof db.user.count>
    update: MockedFunction<typeof db.user.update>
  }
  paymentMandate: {
    findMany: MockedFunction<typeof db.paymentMandate.findMany>
    findUnique: MockedFunction<typeof db.paymentMandate.findUnique>
    count: MockedFunction<typeof db.paymentMandate.count>
    update: MockedFunction<typeof db.paymentMandate.update>
  }
  contribution: {
    findMany: MockedFunction<typeof db.contribution.findMany>
    count: MockedFunction<typeof db.contribution.count>
  }
  auditLog: {
    findMany: MockedFunction<typeof db.auditLog.findMany>
    count: MockedFunction<typeof db.auditLog.count>
    create: MockedFunction<typeof db.auditLog.create>
  }
  goal: {
    findMany: MockedFunction<typeof db.goal.findMany>
    count: MockedFunction<typeof db.goal.count>
  }
}

const mockWriteAuditLog  = writeAuditLog as MockedFunction<typeof writeAuditLog>
const mockGenContribs    = generateMonthlyContributions as unknown as MockedFunction<() => Promise<{ created: number; skipped: number }>>
const mockSendSMS        = sendSMS as MockedFunction<typeof sendSMS>
const mockSendEmail      = sendWelcomeEmail as MockedFunction<typeof sendWelcomeEmail>

const ADMIN_ROLES = ['ADMIN', 'MEMBER']
const MEMBER_ROLES = ['MEMBER']

beforeEach(() => { vi.clearAllMocks() })

// ─── Access control ───────────────────────────────────────────────────────────

describe('access control', () => {
  it('listMembers throws AdminForbiddenError for non-admin', async () => {
    await expect(listMembers(MEMBER_ROLES)).rejects.toBeInstanceOf(AdminForbiddenError)
  })
  it('getMemberDetail throws AdminForbiddenError for non-admin', async () => {
    await expect(getMemberDetail(MEMBER_ROLES, 'u1')).rejects.toBeInstanceOf(AdminForbiddenError)
  })
  it('setMemberStatus throws AdminForbiddenError for non-admin', async () => {
    await expect(setMemberStatus('a', MEMBER_ROLES, 'u1', 'ACTIVE')).rejects.toBeInstanceOf(AdminForbiddenError)
  })
})

// ─── listMembers ──────────────────────────────────────────────────────────────

describe('listMembers', () => {
  it('returns paginated member list', async () => {
    mockDb.user.findMany.mockResolvedValue([{ id: 'u1', firstName: 'Sipho', lastName: 'Dlamini' }] as never)
    mockDb.user.count.mockResolvedValue(1)

    const result = await listMembers(ADMIN_ROLES, { page: 1, limit: 10 })
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.totalPages).toBe(1)
  })

  it('passes search filter to db query', async () => {
    mockDb.user.findMany.mockResolvedValue([] as never)
    mockDb.user.count.mockResolvedValue(0)

    await listMembers(ADMIN_ROLES, { search: 'sipho' })
    const callArgs = mockDb.user.findMany.mock.calls[0][0] as { where?: unknown }
    expect(JSON.stringify(callArgs?.where)).toContain('sipho')
  })
})

// ─── setMemberStatus ─────────────────────────────────────────────────────────

describe('setMemberStatus', () => {
  it('updates status and writes audit log', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'u1', status: 'PENDING' } as never)
    mockDb.user.update.mockResolvedValue({ id: 'u1', status: 'ACTIVE', firstName: 'X', lastName: 'Y' } as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await setMemberStatus('admin1', ADMIN_ROLES, 'u1', 'ACTIVE')
    expect(result.status).toBe('ACTIVE')
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_MEMBER_STATUS_CHANGED', payload: { from: 'PENDING', to: 'ACTIVE' } }),
    )
  })

  it('throws AdminNotFoundError when member does not exist', async () => {
    mockDb.user.findUnique.mockResolvedValue(null as never)
    await expect(setMemberStatus('a', ADMIN_ROLES, 'no-exist', 'ACTIVE')).rejects.toBeInstanceOf(AdminNotFoundError)
  })

  it('throws AdminConflictError when status is unchanged', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'u1', status: 'ACTIVE' } as never)
    await expect(setMemberStatus('a', ADMIN_ROLES, 'u1', 'ACTIVE')).rejects.toBeInstanceOf(AdminConflictError)
  })
})

// ─── approveMandate ──────────────────────────────────────────────────────────

describe('approveMandate', () => {
  it('transitions PENDING to ACTIVE and writes audit log', async () => {
    mockDb.paymentMandate.findUnique.mockResolvedValue({ id: 'm1', status: 'PENDING', userId: 'u1' } as never)
    mockDb.paymentMandate.update.mockResolvedValue({ id: 'm1', status: 'ACTIVE' } as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await approveMandate('admin1', ADMIN_ROLES, 'm1')
    expect(result.status).toBe('ACTIVE')
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_MANDATE_APPROVED' }),
    )
  })

  it('throws AdminConflictError when mandate is not PENDING', async () => {
    mockDb.paymentMandate.findUnique.mockResolvedValue({ id: 'm1', status: 'ACTIVE', userId: 'u1' } as never)
    await expect(approveMandate('a', ADMIN_ROLES, 'm1')).rejects.toBeInstanceOf(AdminConflictError)
  })
})

// ─── rejectMandate ────────────────────────────────────────────────────────────

describe('rejectMandate', () => {
  it('cancels mandate and writes audit log', async () => {
    mockDb.paymentMandate.findUnique.mockResolvedValue({ id: 'm2', status: 'PENDING', userId: 'u2' } as never)
    mockDb.paymentMandate.update.mockResolvedValue({ id: 'm2', status: 'CANCELLED' } as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await rejectMandate('admin1', ADMIN_ROLES, 'm2')
    expect(result.status).toBe('CANCELLED')
  })

  it('throws AdminConflictError when already CANCELLED', async () => {
    mockDb.paymentMandate.findUnique.mockResolvedValue({ id: 'm3', status: 'CANCELLED', userId: 'u3' } as never)
    await expect(rejectMandate('a', ADMIN_ROLES, 'm3')).rejects.toBeInstanceOf(AdminConflictError)
  })
})

// ─── bulkGenerateContributions ───────────────────────────────────────────────

describe('bulkGenerateContributions', () => {
  it('delegates to generateMonthlyContributions and writes audit log', async () => {
    mockGenContribs.mockResolvedValue({ created: 5, skipped: 1 })
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await bulkGenerateContributions('admin1', ADMIN_ROLES, 6, 2025)
    expect(result).toMatchObject({ created: 5, skipped: 1 })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_CONTRIBUTIONS_GENERATED' }),
    )
  })
})

// ─── broadcastNotification ───────────────────────────────────────────────────

describe('broadcastNotification', () => {
  it('sends SMS to all active members and returns counts', async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x.co.za', phone: '+27821000001', firstName: 'A' },
      { id: 'u2', email: 'b@x.co.za', phone: '+27821000002', firstName: 'B' },
    ] as never)
    mockSendSMS.mockResolvedValue([] as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await broadcastNotification('admin1', ADMIN_ROLES, 'Test msg', 'SMS', 'ACTIVE')
    expect(result.smsSent).toBe(2)
    expect(result.emailSent).toBe(0)
    expect(result.failed).toBe(0)
  })

  it('counts failed deliveries without throwing', async () => {
    mockDb.user.findMany.mockResolvedValue([
      { id: 'u1', email: null, phone: '+27821000001', firstName: 'A' },
    ] as never)
    mockSendSMS.mockRejectedValue(new Error('Network error'))
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await broadcastNotification('admin1', ADMIN_ROLES, 'Test msg', 'SMS', 'ALL')
    expect(result.failed).toBe(1)
  })
})

// ─── listAuditLogs ────────────────────────────────────────────────────────────

describe('listAuditLogs', () => {
  it('returns paginated audit events', async () => {
    mockDb.auditLog.findMany.mockResolvedValue([{ id: 'l1', action: 'ADMIN_MANDATE_APPROVED' }] as never)
    mockDb.auditLog.count.mockResolvedValue(1)

    const result = await listAuditLogs(ADMIN_ROLES)
    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
  })
})
