import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    user:       { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    invitation: {
      create:     vi.fn(),
      findUnique: vi.fn(),
      findFirst:  vi.fn(),
      findMany:   vi.fn(),
      count:      vi.fn(),
      update:     vi.fn(),
      // Acceptance is now conditional on the row still being PENDING, so the
      // database refuses a second acceptance rather than the read thirty lines
      // earlier. Previously the only thing stopping two requests carrying the
      // same code was the unique constraint on User.email — protection by
      // accident, from a constraint about something else.
      updateMany: vi.fn(),
    },
    role:     { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    userRole: { create: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
    notificationPreference:   { create: vi.fn() },
    emailVerificationToken:   { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/integrations/email', () => ({
  emailProvider: {
    sendInviteEmail:      vi.fn(),
    sendVerificationEmail: vi.fn(),
  },
}))

vi.mock('@/integrations/sms', () => ({
  smsProvider: {
    send:          vi.fn(),
    normalisePhone: vi.fn((p: string) => p),
  },
}))

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
}))

vi.mock('@/services/audit.service', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/role-version', () => ({
  bumpRoleVersion: vi.fn().mockResolvedValue(undefined),
}))

import { db } from '@/lib/db'
import { emailProvider } from '@/integrations/email'
import { smsProvider } from '@/integrations/sms'
import { writeAuditLog } from '@/services/audit.service'
import { ForbiddenError, InviteNotFoundError, InviteUsedError, InviteRevokedError, InviteExpiredError, InviteDuplicateError, InviteBindingError, MemberCapReachedError } from '@/lib/errors'
import {
  generateInvite, listInvitations, revokeInvitation,
  validateInviteCode, acceptInviteRegistration, setMemberRole,
  getMyInvitation,
  countMemberPlaces,
} from '@/services/invite.service'

const InviteForbiddenError = ForbiddenError
const RoleForbiddenError   = ForbiddenError

const mockDb = db as {
  user:       { findUnique: MockedFunction<typeof db.user.findUnique>; findFirst: MockedFunction<typeof db.user.findFirst>; count: MockedFunction<typeof db.user.count> }
  invitation: {
    create:     MockedFunction<typeof db.invitation.create>
    findUnique: MockedFunction<typeof db.invitation.findUnique>
    findFirst:  MockedFunction<typeof db.invitation.findFirst>
    findMany:   MockedFunction<typeof db.invitation.findMany>
    count:      MockedFunction<typeof db.invitation.count>
    update:     MockedFunction<typeof db.invitation.update>
  }
  role:     {
    findUniqueOrThrow: MockedFunction<typeof db.role.findUniqueOrThrow>
    findUnique: MockedFunction<typeof db.role.findUnique>
  }
  userRole: {
    upsert: MockedFunction<typeof db.userRole.upsert>
    deleteMany: MockedFunction<typeof db.userRole.deleteMany>
    count: MockedFunction<typeof db.userRole.count>
  }
  $transaction: MockedFunction<typeof db.$transaction>
}

const mockSendInviteEmail      = emailProvider.sendInviteEmail      as MockedFunction<typeof emailProvider.sendInviteEmail>
const mockSendVerificationEmail = emailProvider.sendVerificationEmail as MockedFunction<typeof emailProvider.sendVerificationEmail>
const mockSendSMS              = smsProvider.send              as MockedFunction<typeof smsProvider.send>
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

beforeEach(() => {
  vi.clearAllMocks()
  // A circle with room in it, unless a test says otherwise. Without a default
  // every existing invite test would trip the fifty-member cap on an undefined
  // count.
  mockDb.user.count.mockResolvedValue(10 as never)
  mockDb.invitation.count.mockResolvedValue(2 as never)
})

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

// ─── getMyInvitation ──────────────────────────────────────────────────────────

describe('getMyInvitation', () => {
  const ROW = {
    id: 'inv1',
    codePrefix: 'ABCD',
    firstName: 'Kurhula', lastName: 'Maluleke',
    email: 'k@x.co.za', phone: '+27821234567',
    minimumAmount: 200,
    acceptedAt: new Date('2026-02-01'),
    createdAt: new Date('2026-01-25'),
    invitedBy: { firstName: 'Tinyiko', lastName: 'Maluleke' },
  }

  it('returns only the invitation this member accepted', async () => {
    mockDb.invitation.findMany.mockResolvedValue([ROW] as never)

    const result = await getMyInvitation('u1')

    // Scoped by construction: the query keys on acceptedById, which is unique,
    // so there is no id parameter for a caller to get wrong.
    expect(mockDb.invitation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { acceptedById: 'u1' } }),
    )
    expect(result).toMatchObject({
      name: 'Kurhula Maluleke',
      invitedBy: 'Tinyiko Maluleke',
      minimumAmount: 200,
    })
  })

  it('never returns anything that could be used as an invite code', async () => {
    mockDb.invitation.findMany.mockResolvedValue([ROW] as never)

    const result = await getMyInvitation('u1')

    // Only codeHash is stored, and that is the point — the raw code was shown
    // once, at issue. The prefix is enough to recognise the invitation and not
    // enough to reuse it.
    expect(result).not.toHaveProperty('codeHash')
    expect(result!.codePrefix).toBe('ABCD')
    expect(JSON.stringify(result)).not.toContain('XKM-ABCD-')
  })

  it('returns null for a founder who joined before invitations existed', async () => {
    mockDb.invitation.findMany.mockResolvedValue([] as never)
    await expect(getMyInvitation('founder-1')).resolves.toBeNull()
  })

  it('survives an inviter whose account has since been erased', async () => {
    mockDb.invitation.findMany.mockResolvedValue([{ ...ROW, invitedBy: null }] as never)

    const result = await getMyInvitation('u1')

    expect(result!.invitedBy).toBeNull()
  })
})

// ─── The fifty-member cap ─────────────────────────────────────────────────────
//
// The guide is emphatic that fifty is a decision, not an aspiration: "the cap
// is a design decision, not a limit we are waiting to escape." Nothing enforced
// it — there was no constant, no check and no configuration, and the fifty-first
// member would have walked straight in.

describe('the fifty-member cap', () => {
  const params = {
    firstName: 'Kurhula', lastName: 'Maluleke',
    email: 'k@x.co.za', phone: '0821234567', minimumAmount: 200,
  }
  const BASE = 'http://localhost:3000'

  function armInviteCreation() {
    mockDb.invitation.findFirst.mockResolvedValue(null as never)
    mockDb.user.findFirst.mockResolvedValue(null as never)
    mockDb.invitation.create.mockResolvedValue({ id: 'inv1' } as never)
    mockSendSMS.mockResolvedValue([] as never)
    mockSendInviteEmail.mockResolvedValue(undefined as never)
    mockWriteAuditLog.mockResolvedValue(undefined)
  }

  it('counts an outstanding invitation as a place taken', async () => {
    armInviteCreation()
    // 49 members and one unaccepted invitation is a full circle. Counting only
    // members would let leadership issue a fifty-first link that could never
    // be honoured.
    mockDb.user.count.mockResolvedValue(49 as never)
    mockDb.invitation.count.mockResolvedValue(1 as never)

    const places = await countMemberPlaces()
    expect(places).toMatchObject({ taken: 50, remaining: 0, isFull: true })

    await expect(generateInvite('a1', ADMIN, params, BASE)).rejects.toBeInstanceOf(MemberCapReachedError)
    expect(mockDb.invitation.create).not.toHaveBeenCalled()
  })

  it('refuses the fifty-first invitation', async () => {
    armInviteCreation()
    mockDb.user.count.mockResolvedValue(50 as never)
    mockDb.invitation.count.mockResolvedValue(0 as never)

    await expect(generateInvite('a1', ADMIN, params, BASE)).rejects.toBeInstanceOf(MemberCapReachedError)
    expect(mockDb.invitation.create).not.toHaveBeenCalled()
  })

  it('still allows the fiftieth invitation', async () => {
    armInviteCreation()
    mockDb.user.count.mockResolvedValue(49 as never)
    mockDb.invitation.count.mockResolvedValue(0 as never)

    // Off-by-one in the strict direction is still a broken promise: the guide
    // says fifty members, not forty-nine.
    await expect(generateInvite('a1', ADMIN, params, BASE)).resolves.toBeDefined()
    expect(mockDb.invitation.create).toHaveBeenCalled()
  })

  it('ignores expired invitations when counting places', async () => {
    armInviteCreation()
    mockDb.user.count.mockResolvedValue(49 as never)
    mockDb.invitation.count.mockResolvedValue(0 as never)

    await countMemberPlaces()

    // An invitation nobody accepted before it lapsed is not holding a seat.
    expect(mockDb.invitation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
        }),
      }),
    )
  })

  it('frees a place when a member is erased', async () => {
    armInviteCreation()
    mockDb.user.count.mockResolvedValue(49 as never)
    mockDb.invitation.count.mockResolvedValue(0 as never)

    await countMemberPlaces()

    // Right-to-erasure is the only thing that releases a seat. Suspension does
    // not: a suspended member keeps their history and their place.
    expect(mockDb.user.count).toHaveBeenCalledWith({ where: { deletedAt: null } })
  })

  describe('the registration backstop', () => {
    const input = {
      inviteCode: 'XKM-ABCD-1234',
      firstName: 'Kurhula', lastName: 'Maluleke',
      email: 'k@x.co.za', phone: '+27821234567',
      password: 'Password1',
      consentToPopia: true as const,
    }

    function armAccept(memberCount: number) {
      mockDb.invitation.findUnique.mockResolvedValue(VALID_INVITE as never)
      mockDb.role.findUniqueOrThrow.mockResolvedValue({ id: 'role1' } as never)
      const userCreate = vi.fn().mockResolvedValue({ id: 'u1', email: 'k@x.co.za', firstName: 'Kurhula' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockDb.$transaction.mockImplementation(async (fn: any) => {
        const txMock = {
          user: { create: userCreate, count: vi.fn().mockResolvedValue(memberCount) },
          userRole: { create: vi.fn() },
          notificationPreference: { create: vi.fn() },
          emailVerificationToken: { create: vi.fn() },
          invitation: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        }
        return fn(txMock as unknown as typeof db)
      })
      mockSendVerificationEmail.mockResolvedValue(undefined as never)
      mockWriteAuditLog.mockResolvedValue(undefined)
      return { userCreate }
    }

    it('refuses to create the fifty-first member', async () => {
      const { userCreate } = armAccept(50)

      // Two invitees accepting at once were both inside the cap when invited.
      await expect(acceptInviteRegistration(input, 'http://localhost'))
        .rejects.toBeInstanceOf(MemberCapReachedError)
      expect(userCreate).not.toHaveBeenCalled()
    })

    it('admits the fiftieth member, whose own invitation does not count against them', async () => {
      const { userCreate } = armAccept(49)

      // The backstop counts members, not invitations. This person is holding a
      // pending invitation right now; counting it would refuse them a place on
      // the strength of the very invite that brought them.
      await expect(acceptInviteRegistration(input, 'http://localhost')).resolves.toBeDefined()
      expect(userCreate).toHaveBeenCalled()
    })
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
      data: expect.objectContaining({
        status: 'REVOKED',
        revokedById: 'a1',
      }),
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
    email: 'k@x.co.za', phone: '+27821234567',
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
        user: {
          create: vi.fn().mockResolvedValue({ id: 'u1', email: 'k@x.co.za', firstName: 'Kurhula' }),
          count: vi.fn().mockResolvedValue(10),
        },
        userRole: { create: vi.fn() },
        notificationPreference: { create: vi.fn() },
        emailVerificationToken: { create: vi.fn() },
        invitation: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
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

  it('refuses a second acceptance of the same code, in the database', async () => {
    // Two requests carrying one code both read PENDING, both pass the check
    // thirty lines up, and both reach the write. This was survivable only
    // because User.email is unique and the second insert happened to violate
    // it — protection by accident, from a constraint about something else.
    mockDb.invitation.findUnique.mockResolvedValue(VALID_INVITE as never)
    mockDb.role.findUniqueOrThrow.mockResolvedValue({ id: 'role1' } as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockDb.$transaction.mockImplementation(async (fn: any) => {
      const txMock = {
        user: {
          create: vi.fn().mockResolvedValue({ id: 'u2', email: 'k@x.co.za', firstName: 'Kurhula' }),
          count: vi.fn().mockResolvedValue(10),
        },
        userRole: { create: vi.fn() },
        notificationPreference: { create: vi.fn() },
        emailVerificationToken: { create: vi.fn() },
        // The row was claimed by the other request between the read and here.
        invitation: { update: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      }
      return fn(txMock as unknown as typeof db)
    })

    await expect(acceptInviteRegistration(input, 'http://localhost')).rejects.toThrow(InviteUsedError)
  })
})

// ─── setMemberRole ────────────────────────────────────────────────────────────

describe('setMemberRole', () => {
  it('throws RoleForbiddenError for non-admin', async () => {
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
    mockDb.role.findUnique.mockResolvedValue({ id: 'role1' } as never)
    mockDb.userRole.count.mockResolvedValue(2)
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
