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

vi.mock('@/integrations/sms', () => ({
  smsProvider: {
    send: vi.fn(),
    sendBulk: vi.fn(),
    normalisePhone: vi.fn((p: string) => p),
  },
}))

vi.mock('@/integrations/email', () => ({
  emailProvider: {
    sendWelcomeEmail: vi.fn(),
    sendBroadcastEmail: vi.fn(),
    sendGenericEmail: vi.fn(),
  },
}))

vi.mock('@/services/contribution.service', () => ({
  generateMonthlyContributions: vi.fn(),
}))

vi.mock('@/integrations/payment', () => ({
  paymentGateway: { cancelMandate: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/services/audit.service', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('@/services/notification.service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/role-version', () => ({
  bumpRoleVersion: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/env', () => ({
  env: {
    DATABASE_URL: 'postgresql://x:x@localhost/x',
    NEXTAUTH_SECRET: 'test-secret-minimum-32-characters-xx',
    ENCRYPTION_KEY: 'a'.repeat(64),
    NETCASH_SERVICE_KEY: 'test',
    NETCASH_WEBHOOK_SECRET: 'test',
    NETCASH_API_URL: 'https://test.example.com',
    BULKSMS_USERNAME: 'test',
    BULKSMS_PASSWORD: 'test',
    RESEND_API_KEY: 'test',
    RESEND_FROM_EMAIL: 'test@example.com',
    INNGEST_EVENT_KEY: 'test',
    INNGEST_SIGNING_KEY: 'test',
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'test',
    BLOB_READ_WRITE_TOKEN: 'test',
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 15,
    ENABLE_GOAL_LOCKING: true,
    ENABLE_MANUAL_PAYMENTS: true,
    WHATSAPP_GROUP_LINK: 'https://chat.whatsapp.com/test',
    WHATSAPP_GROUP_NAME: 'Test',
    ADMIN_WHATSAPP_NUMBER: '27810780859',
  },
}))

vi.mock('@/lib/cache', () => ({
  cache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  },
  CACHE_KEYS: {
    DASHBOARD_STATS: 'xxm:cache:stats',
    DASHBOARD_STATS_TTL: 300,
    goalsPage: (s: string, p: number, l: number) => `xxm:cache:goals:${s}:${p}:${l}`,
    GOALS_TTL: 120,
  },
}))

import { db } from '@/lib/db'
import { writeAuditLog } from '@/services/audit.service'
import { generateMonthlyContributions } from '@/services/contribution.service'
import { smsProvider } from '@/integrations/sms'
import { emailProvider } from '@/integrations/email'
import { ForbiddenError, AdminNotFoundError, AdminConflictError } from '@/lib/errors'
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
} from '@/services/admin.service'

// Alias to preserve test body readability
const AdminForbiddenError = ForbiddenError

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
const mockSendSMS        = smsProvider.send as MockedFunction<typeof smsProvider.send>
const mockSendEmail      = emailProvider.sendWelcomeEmail as MockedFunction<typeof emailProvider.sendWelcomeEmail>

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
    mockDb.user.findMany.mockResolvedValue([{ id: 'u1', status: 'PENDING' }] as never)
    mockDb.user.update.mockResolvedValue({ id: 'u1', status: 'ACTIVE', firstName: 'X', lastName: 'Y' } as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await setMemberStatus('admin1', ADMIN_ROLES, 'u1', 'ACTIVE')
    expect(result.status).toBe('ACTIVE')
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_MEMBER_STATUS_CHANGED', payload: { from: 'PENDING', to: 'ACTIVE' } }),
    )
  })

  it('throws AdminNotFoundError when member does not exist', async () => {
    mockDb.user.findMany.mockResolvedValue([] as never)
    await expect(setMemberStatus('a', ADMIN_ROLES, 'no-exist', 'ACTIVE')).rejects.toBeInstanceOf(AdminNotFoundError)
  })

  it('throws AdminConflictError when status is unchanged', async () => {
    mockDb.user.findMany.mockResolvedValue([{ id: 'u1', status: 'ACTIVE' }] as never)
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
  it('turns down a waiting request, and records why', async () => {
    mockDb.paymentMandate.findUnique.mockResolvedValue({ id: 'm2', status: 'PENDING', userId: 'u2' } as never)
    mockDb.paymentMandate.update.mockResolvedValue({ id: 'm2', status: 'CANCELLED' } as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await rejectMandate('admin1', ADMIN_ROLES, 'm2', undefined, 'Account name does not match')

    expect(result.status).toBe('CANCELLED')
    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADMIN_MANDATE_REJECTED',
      payload: expect.objectContaining({ reason: 'Account name does not match' }),
    }))
  })

  it('calls a live one a cancellation, because that is what it is', async () => {
    // The member had been approved. Telling them it "was not approved" and to
    // check their bank details is false twice over, so the two acts are
    // recorded and announced differently.
    mockDb.paymentMandate.findUnique.mockResolvedValue({ id: 'm4', status: 'ACTIVE', userId: 'u4' } as never)
    mockDb.paymentMandate.update.mockResolvedValue({ id: 'm4', status: 'CANCELLED' } as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    await rejectMandate('admin1', ADMIN_ROLES, 'm4', undefined, 'Account closed at the bank')

    expect(mockWriteAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ADMIN_MANDATE_CANCELLED',
    }))
  })

  it('refuses without a reason the member can act on', async () => {
    mockDb.paymentMandate.findUnique.mockResolvedValue({ id: 'm2', status: 'PENDING', userId: 'u2' } as never)

    await expect(rejectMandate('admin1', ADMIN_ROLES, 'm2', undefined, 'no'))
      .rejects.toBeInstanceOf(AdminConflictError)
    expect(mockDb.paymentMandate.update).not.toHaveBeenCalled()
  })

  it('throws AdminConflictError when already CANCELLED', async () => {
    mockDb.paymentMandate.findUnique.mockResolvedValue({ id: 'm3', status: 'CANCELLED', userId: 'u3' } as never)
    await expect(rejectMandate('a', ADMIN_ROLES, 'm3', undefined, 'Duplicate of an earlier request'))
      .rejects.toBeInstanceOf(AdminConflictError)
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

  it('hands the name, subject and body to the email layer unrendered', async () => {
    // Both are attacker-reachable in different ways: a member sets their own
    // first name, an admin (or a compromised admin account) types the message
    // and the subject. None of them may inject markup into an email every
    // recipient's client renders.
    //
    // The escaping moved with the markup. The broadcast used to build its own
    // HTML inline here; it now calls `sendBroadcastEmail`, which owns the
    // template and escapes every interpolation. So what this asserts is that
    // the raw values are handed over rather than pre-rendered — the escaping
    // itself is covered against the real function, not a mock of it.
    const mockSendBroadcast = emailProvider.sendBroadcastEmail as MockedFunction<typeof emailProvider.sendBroadcastEmail>
    mockDb.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x.co.za', phone: null, firstName: '<img src=x onerror=alert(1)>' },
    ] as never)
    mockSendBroadcast.mockResolvedValue(undefined)
    mockWriteAuditLog.mockResolvedValue(undefined)

    await broadcastNotification(
      'admin1', ADMIN_ROLES, 'Click <script>steal()</script> here', 'EMAIL', 'ALL',
      undefined, 'Meeting moved',
    )

    const [, firstName, subject, message] = mockSendBroadcast.mock.calls[0]!
    expect(firstName).toBe('<img src=x onerror=alert(1)>')
    expect(subject).toBe('Meeting moved')
    expect(message).toBe('Click <script>steal()</script> here')
  })

  it('titles the message with the subject rather than the Foundation name', async () => {
    // Every broadcast used to arrive as "Message from Xkimi Xa Mali Foundation"
    // — the same words for a meeting reminder and a change to the contribution
    // amount, and the only line most members read before deciding to open it.
    const mockSendBroadcast = emailProvider.sendBroadcastEmail as MockedFunction<typeof emailProvider.sendBroadcastEmail>
    mockDb.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x.co.za', phone: null, firstName: 'Kurhula' },
    ] as never)
    mockSendBroadcast.mockResolvedValue(undefined)
    mockWriteAuditLog.mockResolvedValue(undefined)

    await broadcastNotification(
      'admin1', ADMIN_ROLES, 'We meet on Saturday.', 'EMAIL', 'ALL',
      undefined, 'September meeting moved',
    )

    expect(mockSendBroadcast.mock.calls[0]![2]).toBe('September meeting moved')
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
