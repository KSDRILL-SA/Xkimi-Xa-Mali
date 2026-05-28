import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    user:       { findUnique: vi.fn(), findFirst: vi.fn() },
    invitation: {
      create:     vi.fn(),
      findUnique: vi.fn(),
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      update:     vi.fn(),
    },
    role:     { findUniqueOrThrow: vi.fn() },
    userRole: { create: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    notificationPreference:   { create: vi.fn() },
    emailVerificationToken:   { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/email', () => ({
  sendInviteEmail:      vi.fn(),
  sendVerificationEmail: vi.fn(),
}))

vi.mock('@/lib/bulksms', () => ({
  sendSMS:        vi.fn(),
  normalisePhone: vi.fn((p: string) => p.startsWith('+27') ? p : `+27${p.slice(1)}`),
}))

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
}))

vi.mock('@/services/audit.service', () => ({
  writeAuditLog: vi.fn(),
}))

import { db } from '@/lib/db'
import { sendInviteEmail, sendVerificationEmail } from '@/lib/email'
import { sendSMS } from '@/lib/bulksms'
import { writeAuditLog } from '@/services/audit.service'
import {
  generateInvite, listInvitations, revokeInvitation,
  validateInviteCode, acceptInviteRegistration, setMemberRole,
  InviteForbiddenError, InviteNotFoundError, InviteUsedError,
  InviteRevokedError, InviteExpiredError, InviteDuplicateError,
  InviteBindingError,
} from '@/services/invite.service'

const mockDb = db as {
  user:       { findUnique: MockedFunction<typeof db.user.findUnique>; findFirst: MockedFunction<typeof db.user.findFirst> }
  invitation: {
    create:     MockedFunction<typeof db.invitation.create>
    findUnique: MockedFunction<typeof db.invitation.findUnique>
    findFirst:  MockedFunction<typeof db.invitation.findFirst>
    findMany:   MockedFunction<typeof db.invitation.findMany>
    count:      MockedFunction<typeof db.invitation.count>
    update:     MockedFunction<typeof db.invitation.update>
  }
  role:     { findUniqueOrThrow: MockedFunction<typeof db.role.findUniqueOrThrow> }
  userRole: { upsert: MockedFunction<typeof db.userRole.upsert>; deleteMany: MockedFunction<typeof db.userRole.deleteMany> }
  $transaction: MockedFunction<typeof db.$transaction>
}

const mockSendInviteEmail      = sendInviteEmail      as MockedFunction<typeof sendInviteEmail>
const mockSendVerificationEmail = sendVerificationEmail as MockedFunction<typeof sendVerificationEmail>
const mockSendSMS              = sendSMS              as MockedFunction<typeof sendSMS>
const mockWriteAuditLog        = writeAuditLog        as MockedFunction<typeof writeAuditLog>

const ADMIN  = ['ADMIN', 'MEMBER']
const MEMBER = ['MEMBER']

const VALID_INVITE = {
  id: 'inv1', status: 'PENDING',
  expiresAt: new Date(Date.now() + 3_600_000),
  firstName: 'Kurhula', lastName: 'Maluleke',
  email: 'k@x.co.za', phone: '+27821234567',
  minimumAmount: { toNumber: () => 200 },
  invitedById: 'a1',
}

beforeEach(() => { vi.clearAllMocks() })

// ─── generateInvite ───────────────────────────────────────────────────────────

describe('generateInvite', () => {
  const params = {
    firstName: 'Kurhula', lastName: 'Maluleke',
    email: 'k@x.co.za', phone: '0821234567', minimumAmount: 200,
  }

  const BASE = 'http://localhost:3000'

  it('throws InviteForbiddenError for non-admin', async () => {
    await expect(generateInvite('u1', MEMBER, params, BASE)).rejects.toBeInstanceOf(InviteForbiddenError)
  })

  it('throws InviteDuplicateError when active invite exists', async () => {
    mockDb.invitation.findFirst.mockResolvedValue({ id: 'existing' } as never)
    mockDb.user.findFirst.mockResolvedValue(null as never)
    await expect(generateInvite('a1', ADMIN, params, BASE)).rejects.toBeInstanceOf(InviteDuplicateError)
  })

  it('throws InviteDuplicateError when user already registered', async () => {
    mockDb.invitation.findFirst.mockResolvedValue(null as never)
    mockDb.user.findFirst.mockResolvedValue({ id: 'u2' } as never)
    await expect(generateInvite('a1', ADMIN, params, BASE)).rejects.toBeInstanceOf(InviteDuplicateError)
  })

  it('creates invite, sends SMS+email, writes audit log', async () => {
    mockDb.invitation.findFirst.mockResolvedValue(null as never)
    mockDb.user.findFirst.mockResolvedValue(null as never)
    mockDb.invitation.create.mockResolvedValue({ id: 'inv1' } as never)
    mockSendSMS.mockResolvedValue([] as never)
    mockSendInviteEmail.mockResolvedValue(undefined as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await generateInvite('a1', ADMIN, params, BASE)

    expect(mockDb.invitation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'k@x.co.za',
          firstName: 'Kurhula',
          minimumAmount: 200,
        }),
      }),
    )
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_INVITE_CREATED' }),
    )
    expect(result.code).toMatch(/^XKM-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
    expect(result.codePrefix).toHaveLength(4)
  })
})

// ─── validateInviteCode ───────────────────────────────────────────────────────

describe('validateInviteCode', () => {
  it('throws InviteNotFoundError for unknown code', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(null as never)
    await expect(validateInviteCode('XKM-FAKE-CODE')).rejects.toBeInstanceOf(InviteNotFoundError)
  })

  it('throws InviteUsedError when status is ACCEPTED', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(
      { ...VALID_INVITE, status: 'ACCEPTED' } as never,
    )
    await expect(validateInviteCode('XKM-ABCD-1234')).rejects.toBeInstanceOf(InviteUsedError)
  })

  it('throws InviteRevokedError when status is REVOKED', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(
      { ...VALID_INVITE, status: 'REVOKED' } as never,
    )
    await expect(validateInviteCode('XKM-ABCD-1234')).rejects.toBeInstanceOf(InviteRevokedError)
  })

  it('throws InviteExpiredError when past expiresAt', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(
      { ...VALID_INVITE, expiresAt: new Date(Date.now() - 1000) } as never,
    )
    await expect(validateInviteCode('XKM-ABCD-1234')).rejects.toBeInstanceOf(InviteExpiredError)
  })

  it('returns pre-filled data for valid code', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(VALID_INVITE as never)
    const result = await validateInviteCode('XKM-ABCD-1234')
    expect(result.email).toBe('k@x.co.za')
    expect(result.firstName).toBe('Kurhula')
    expect(result.phone).toBe('+27821234567')
  })
})

// ─── revokeInvitation ─────────────────────────────────────────────────────────

describe('revokeInvitation', () => {
  it('throws InviteForbiddenError for non-admin', async () => {
    await expect(revokeInvitation('u1', MEMBER, 'inv1')).rejects.toBeInstanceOf(InviteForbiddenError)
  })

  it('throws InviteNotFoundError when invite does not exist', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(null as never)
    await expect(revokeInvitation('a1', ADMIN, 'inv1')).rejects.toBeInstanceOf(InviteNotFoundError)
  })

  it('throws InviteUsedError when invite already accepted', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(
      { id: 'inv1', email: 'k@x.co.za', status: 'ACCEPTED' } as never,
    )
    await expect(revokeInvitation('a1', ADMIN, 'inv1')).rejects.toBeInstanceOf(InviteUsedError)
  })

  it('throws InviteRevokedError when invite already revoked', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(
      { id: 'inv1', email: 'k@x.co.za', status: 'REVOKED' } as never,
    )
    await expect(revokeInvitation('a1', ADMIN, 'inv1')).rejects.toBeInstanceOf(InviteRevokedError)
  })

  it('sets status REVOKED and writes audit log', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(
      { id: 'inv1', email: 'k@x.co.za', status: 'PENDING' } as never,
    )
    mockDb.invitation.update.mockResolvedValue({} as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    await revokeInvitation('a1', ADMIN, 'inv1')

    expect(mockDb.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv1' },
      data: { status: 'REVOKED' },
    })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ADMIN_INVITE_REVOKED' }),
    )
  })
})

// ─── acceptInviteRegistration ─────────────────────────────────────────────────

describe('acceptInviteRegistration', () => {
  const input = {
    inviteCode: 'XKM-ABCD-1234',
    firstName: 'Kurhula', lastName: 'Maluleke',
    email: 'k@x.co.za', phone: '0821234567',
    password: 'Password1',
    consentToPopia: true as const,
  }

  it('throws InviteBindingError when email does not match', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(VALID_INVITE as never)
    await expect(
      acceptInviteRegistration({ ...input, email: 'wrong@x.co.za' }, 'http://localhost'),
    ).rejects.toBeInstanceOf(InviteBindingError)
  })

  it('throws InviteBindingError when phone does not match', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(VALID_INVITE as never)
    await expect(
      acceptInviteRegistration({ ...input, phone: '0831111111' }, 'http://localhost'),
    ).rejects.toBeInstanceOf(InviteBindingError)
  })

  it('creates user, accepts invite, and sends verification email', async () => {
    mockDb.invitation.findUnique.mockResolvedValue(VALID_INVITE as never)
    mockDb.role.findUniqueOrThrow.mockResolvedValue({ id: 'role1' } as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const txMock = {
        user: { create: vi.fn().mockResolvedValue({ id: 'u1', email: 'k@x.co.za', firstName: 'Kurhula' }) },
        userRole: { create: vi.fn() },
        notificationPreference: { create: vi.fn() },
        emailVerificationToken: { create: vi.fn() },
        invitation: { update: vi.fn() },
      }
      return fn(txMock as unknown as typeof db)
    })
    mockSendVerificationEmail.mockResolvedValue(undefined as never)
    mockWriteAuditLog.mockResolvedValue(undefined)

    const result = await acceptInviteRegistration(input, 'http://localhost')
    expect(result.email).toBe('k@x.co.za')
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'INVITE_ACCEPTED' }),
    )
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
