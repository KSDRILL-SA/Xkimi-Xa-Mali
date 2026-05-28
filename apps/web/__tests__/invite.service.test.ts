import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    user:     { findUnique: vi.fn() },
    invite:   { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), delete: vi.fn(), update: vi.fn() },
    role:     { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    userRole: { create: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    notificationPreference: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/email', () => ({
  sendInviteEmail: vi.fn(),
}))

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
}))

vi.mock('@/services/audit.service', () => ({
  writeAuditLog: vi.fn(),
}))

import { db } from '@/lib/db'
import { sendInviteEmail } from '@/lib/email'
import { writeAuditLog } from '@/services/audit.service'
import {
  createInvite, listInvites, revokeInvite,
  validateInviteToken, acceptInvite, setMemberRole,
  InviteForbiddenError, InviteNotFoundError,
  InviteExpiredError, InviteAlreadyAcceptedError, InviteDuplicateEmailError,
} from '@/services/invite.service'

const mockDb = db as {
  user:     { findUnique: MockedFunction<typeof db.user.findUnique> }
  invite:   {
    create: MockedFunction<typeof db.invite.create>
    findUnique: MockedFunction<typeof db.invite.findUnique>
    findMany: MockedFunction<typeof db.invite.findMany>
    count: MockedFunction<typeof db.invite.count>
    delete: MockedFunction<typeof db.invite.delete>
    update: MockedFunction<typeof db.invite.update>
  }
  role:     { findUniqueOrThrow: MockedFunction<typeof db.role.findUniqueOrThrow> }
  userRole: { upsert: MockedFunction<typeof db.userRole.upsert>; deleteMany: MockedFunction<typeof db.userRole.deleteMany> }
  $transaction: MockedFunction<typeof db.$transaction>
}

const mockSendInviteEmail = sendInviteEmail as MockedFunction<typeof sendInviteEmail>
const mockWriteAuditLog   = writeAuditLog   as MockedFunction<typeof writeAuditLog>

const ADMIN  = ['ADMIN', 'MEMBER']
const MEMBER = ['MEMBER']

beforeEach(() => { vi.clearAllMocks() })

// ─── createInvite ─────────────────────────────────────────────────────────────

describe('createInvite', () => {
  it('throws InviteForbiddenError for non-admin', async () => {
    await expect(createInvite('u1', MEMBER, 'x@x.co.za', 'http://localhost')).rejects.toBeInstanceOf(InviteForbiddenError)
  })

  it('throws InviteDuplicateEmailError when user already exists', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'existing' } as never)
    await expect(createInvite('a1', ADMIN, 'taken@x.co.za', 'http://localhost')).rejects.toBeInstanceOf(InviteDuplicateEmailError)
  })

  it('creates invite and sends email', async () => {
    mockDb.user.findUnique.mockResolvedValue(null as never)
    mockDb.invite.create.mockResolvedValue({} as never)
    mockSendInviteEmail.mockResolvedValue(undefined as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await createInvite('a1', ADMIN, 'new@x.co.za', 'http://localhost')

    expect(mockDb.invite.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'new@x.co.za' }) }),
    )
    expect(mockSendInviteEmail).toHaveBeenCalledWith(
      'new@x.co.za',
      expect.stringContaining('/invite/'),
      72,
    )
    expect(result.email).toBe('new@x.co.za')
  })
})

// ─── validateInviteToken ─────────────────────────────────────────────────────

describe('validateInviteToken', () => {
  it('throws InviteNotFoundError for unknown token', async () => {
    mockDb.invite.findUnique.mockResolvedValue(null as never)
    await expect(validateInviteToken('bad-token')).rejects.toBeInstanceOf(InviteNotFoundError)
  })

  it('throws InviteAlreadyAcceptedError when acceptedAt is set', async () => {
    mockDb.invite.findUnique.mockResolvedValue({
      id: 'i1', email: 'x@x.co.za',
      expiresAt: new Date(Date.now() + 3_600_000),
      acceptedAt: new Date(),
    } as never)
    await expect(validateInviteToken('some-token')).rejects.toBeInstanceOf(InviteAlreadyAcceptedError)
  })

  it('throws InviteExpiredError when past expiresAt', async () => {
    mockDb.invite.findUnique.mockResolvedValue({
      id: 'i1', email: 'x@x.co.za',
      expiresAt: new Date(Date.now() - 1000),
      acceptedAt: null,
    } as never)
    await expect(validateInviteToken('some-token')).rejects.toBeInstanceOf(InviteExpiredError)
  })

  it('returns email and expiresAt for valid token', async () => {
    const expiresAt = new Date(Date.now() + 3_600_000)
    mockDb.invite.findUnique.mockResolvedValue({
      id: 'i1', email: 'valid@x.co.za',
      expiresAt, acceptedAt: null,
    } as never)
    const result = await validateInviteToken('valid-token')
    expect(result.email).toBe('valid@x.co.za')
  })
})

// ─── revokeInvite ────────────────────────────────────────────────────────────

describe('revokeInvite', () => {
  it('deletes pending invite and writes audit log', async () => {
    mockDb.invite.findUnique.mockResolvedValue({ id: 'i1', email: 'x@x.co.za', acceptedAt: null } as never)
    mockDb.invite.delete.mockResolvedValue({} as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    await revokeInvite('a1', ADMIN, 'i1')
    expect(mockDb.invite.delete).toHaveBeenCalledWith({ where: { id: 'i1' } })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_INVITE_REVOKED' }),
    )
  })

  it('throws InviteAlreadyAcceptedError when invite is used', async () => {
    mockDb.invite.findUnique.mockResolvedValue({ id: 'i1', email: 'x@x.co.za', acceptedAt: new Date() } as never)
    await expect(revokeInvite('a1', ADMIN, 'i1')).rejects.toBeInstanceOf(InviteAlreadyAcceptedError)
  })
})

// ─── setMemberRole ────────────────────────────────────────────────────────────

describe('setMemberRole', () => {
  it('throws RoleForbiddenError for non-admin', async () => {
    const { RoleForbiddenError } = await import('@/services/invite.service')
    await expect(setMemberRole('u1', MEMBER, 'u2', 'ADMIN', true)).rejects.toBeInstanceOf(RoleForbiddenError)
  })

  it('upserts UserRole when assigning and writes audit log', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'u2', email: 'x@x.co.za' } as never)
    mockDb.role.findUniqueOrThrow.mockResolvedValue({ id: 'role1' } as never)
    mockDb.userRole.upsert.mockResolvedValue({} as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await setMemberRole('a1', ADMIN, 'u2', 'ADMIN', true)
    expect(mockDb.userRole.upsert).toHaveBeenCalled()
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_ROLE_ASSIGNED' }),
    )
    expect(result.assigned).toBe(true)
  })

  it('deletes UserRole when revoking', async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: 'u2', email: 'x@x.co.za' } as never)
    mockDb.role.findUniqueOrThrow.mockResolvedValue({ id: 'role1' } as never)
    mockDb.userRole.deleteMany.mockResolvedValue({ count: 1 } as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await setMemberRole('a1', ADMIN, 'u2', 'ADMIN', false)
    expect(mockDb.userRole.deleteMany).toHaveBeenCalled()
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_ROLE_REVOKED' }),
    )
    expect(result.assigned).toBe(false)
  })
})
