import { encrypt, tryDecrypt, maskAccountNumber, maskStoredSecret, UNREADABLE_SECRET } from '@/lib/encryption'
import { writeAuditLog } from './audit.service'
import { logger } from '@xxm/observability'
import {
  MemberNotFoundError,
  BankAccountNotFoundError,
  BankAccountConflictError,
  isForeignKeyViolation,
} from '@/lib/errors'
import { assertCanAccess } from '@/lib/authorization'
import { tallyBy } from '@/lib/aggregate'
import type {
  UpdateProfileInput,
  CreateBankAccountInput,
  UpdateBankAccountInput,
  NotificationPreferencesInput,
} from '@/lib/validation/profile'
import type { Prisma } from '@prisma/client'
import { userRepo } from '@/repositories/user.repository'
import { bankAccountRepo } from '@/repositories/bank-account.repository'
import { contributionRepo } from '@/repositories/contribution.repository'
import { runTransaction } from '@/repositories/user.repository'
import { mandateRepo } from '@/repositories/mandate.repository'
import { notificationRepo } from '@/repositories/notification.repository'

function maskIdNumber(encrypted: string | null, userId: string): string | null {
  if (!encrypted) return null
  return maskStoredSecret(encrypted, { field: 'idNumber', userId })
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getMemberProfile(
  targetUserId: string,
  requesterId: string,
  requesterRoles: string[],
) {
  assertCanAccess(targetUserId, requesterId, requesterRoles)

  type ProfileUser = Prisma.UserGetPayload<{
    select: {
      id: true
      email: true
      phone: true
      firstName: true
      lastName: true
      idNumber: true
      address: true
      status: true
      emailVerified: true
      popiaConsentAt: true
      createdAt: true
      roles: { select: { role: { select: { name: true } } } }
    }
  }>

  const user = (await userRepo.findById(targetUserId, {
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      idNumber: true,
      address: true,
      status: true,
      emailVerified: true,
      popiaConsentAt: true,
      createdAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  })) as ProfileUser | null

  if (!user) throw new MemberNotFoundError()

  return {
    ...user,
    idNumberMasked: maskIdNumber(user.idNumber, user.id),
    idNumber: undefined,
    roles: user.roles.map((r) => r.role.name),
  }
}

export async function updateMemberProfile(
  targetUserId: string,
  requesterId: string,
  requesterRoles: string[],
  input: UpdateProfileInput,
  ipAddress?: string,
) {
  assertCanAccess(targetUserId, requesterId, requesterRoles)

  if (input.phone) {
    const clash = await userRepo.findByEmailOrPhone(undefined, input.phone, targetUserId)
    if (clash) throw new BankAccountConflictError('That phone number is already in use', 'MBR_003')
  }

  const updated = await userRepo.update(targetUserId, {
    ...(input.firstName && { firstName: input.firstName }),
    ...(input.lastName && { lastName: input.lastName }),
    ...(input.phone && { phone: input.phone }),
    ...(input.address && { address: input.address }),
  }, { id: true, firstName: true, lastName: true, phone: true, address: true })

  await writeAuditLog({
    userId: requesterId,
    action: 'PROFILE_UPDATED',
    entity: 'User',
    entityId: targetUserId,
    payload: { fields: Object.keys(input) },
    ipAddress,
  })

  logger.info('Profile updated', { targetUserId, requesterId, fields: Object.keys(input) })
  return updated
}

// ─── Summary ──────────────────────────────────────────────────────────────────

export async function getMemberSummary(
  targetUserId: string,
  requesterId: string,
  requesterRoles: string[],
) {
  assertCanAccess(targetUserId, requesterId, requesterRoles)

  const currentYear = new Date().getFullYear()

  // All aggregation pushed to DB — avoids loading the full contributions table into memory.
  const [allTimeTotals, yearlyTotals, statusCounts, activeMandate] = await Promise.all([
    contributionRepo.aggregate(
      { userId: targetUserId },
      { _sum: { amountPaid: true } },
    ),
    contributionRepo.aggregate(
      { userId: targetUserId, periodYear: currentYear },
      { _sum: { amountPaid: true } },
    ),
    contributionRepo.groupBy({
      by: ['status'],
      where: { userId: targetUserId },
      _count: { status: true },
    }),
    mandateRepo.findActiveByUser(targetUserId, { id: true, amount: true, debitDay: true }),
  ])

  const statusMap = tallyBy(statusCounts, (r) => r.status, 'status')

  return {
    totalContributed: Number(allTimeTotals._sum?.amountPaid ?? 0),
    yearlyContributed: Number(yearlyTotals._sum?.amountPaid ?? 0),
    paidCount: statusMap['PAID'] ?? 0,
    overdueCount: statusMap['OVERDUE'] ?? 0,
    activeMandate: activeMandate
      ? { id: activeMandate.id, amount: Number(activeMandate.amount), debitDay: activeMandate.debitDay }
      : null,
  }
}

// ─── POPIA data export ────────────────────────────────────────────────────────

export async function exportMemberData(
  targetUserId: string,
  requesterId: string,
  requesterRoles: string[],
) {
  assertCanAccess(targetUserId, requesterId, requesterRoles)

  type ExportUser = Prisma.UserGetPayload<{
    include: {
      roles: { include: { role: true } }
      bankAccounts: true
      mandates: true
      contributions: { include: { transactions: true } }
      notifications: true
      notificationPreference: true
    }
  }>

  const rawUser = await userRepo.findById(targetUserId, {
    include: {
      roles: { include: { role: true } },
      bankAccounts: true,
      mandates: true,
      contributions: { include: { transactions: true } },
      notifications: true,
      notificationPreference: true,
    },
  })

  if (!rawUser) throw new MemberNotFoundError()
  const user = rawUser as ExportUser

  await writeAuditLog({
    userId: requesterId,
    action: 'DATA_EXPORTED',
    entity: 'User',
    entityId: targetUserId,
  })

  logger.info('POPIA data export requested', { targetUserId, requesterId })

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      // A field we cannot read is reported as such. The member has a right to
      // the export, so one unreadable column must not deny them the rest of it.
      idNumber: user.idNumber ? tryDecrypt(user.idNumber, { field: 'idNumber', userId: user.id }) : null,
      address: user.address,
      status: user.status,
      popiaConsentAt: user.popiaConsentAt,
      createdAt: user.createdAt,
      roles: user.roles.map((r) => r.role.name),
    },
    bankAccounts: user.bankAccounts.map((a) => ({
      bankName: a.bankName,
      accountNumber: tryDecrypt(a.accountNumber, {
        field: 'bankAccount.accountNumber',
        bankAccountId: a.id,
        userId: user.id,
      }) ?? UNREADABLE_SECRET,
      accountType: a.accountType,
      branchCode: a.branchCode,
      isPrimary: a.isPrimary,
      verifiedAt: a.verifiedAt,
    })),
    mandates: user.mandates.map((m) => ({
      debitDay: m.debitDay,
      amount: Number(m.amount),
      status: m.status,
      createdAt: m.createdAt,
    })),
    contributions: user.contributions.map((c) => ({
      period: `${c.periodMonth}/${c.periodYear}`,
      amountDue: Number(c.amountDue),
      amountPaid: Number(c.amountPaid),
      status: c.status,
      transactions: c.transactions.map((t) => ({
        amount: Number(t.amount),
        type: t.type,
        status: t.status,
        processedAt: t.processedAt,
      })),
    })),
    notifications: user.notifications.map((n) => ({
      channel: n.channel,
      status: n.status,
      sentAt: n.sentAt,
    })),
    notificationPreferences: user.notificationPreference ?? { sms: true, email: true, push: true, whatsapp: true },
  }
}

// ─── Bank accounts ────────────────────────────────────────────────────────────

export async function listBankAccounts(userId: string) {
  const accounts = await bankAccountRepo.findByUser(userId, [{ isPrimary: 'desc' }, { createdAt: 'asc' }])

  return accounts.map((a) => ({
    id: a.id,
    bankName: a.bankName,
    accountNumberMasked: maskStoredSecret(a.accountNumber, {
      field: 'bankAccount.accountNumber',
      bankAccountId: a.id,
      userId,
    }),
    accountType: a.accountType,
    branchCode: a.branchCode,
    isPrimary: a.isPrimary,
    verifiedAt: a.verifiedAt,
    createdAt: a.createdAt,
  }))
}

export async function addBankAccount(
  userId: string,
  input: CreateBankAccountInput,
  ipAddress?: string,
) {
  const existing = await bankAccountRepo.findByUser(userId)
  // An existing row we cannot read is skipped rather than thrown on: it cannot be
  // compared, and letting it throw here would leave a member whose old account is
  // undecryptable unable to add the replacement that fixes the problem.
  const isDuplicate = existing.some((a) => {
    const plain = tryDecrypt(a.accountNumber, {
      field: 'bankAccount.accountNumber',
      bankAccountId: a.id,
      userId,
    })
    return plain !== null && plain === input.accountNumber
  })
  if (isDuplicate) {
    throw new BankAccountConflictError('This bank account number is already registered', 'BNK_005')
  }
  const makePrimary = input.isPrimary || existing.length === 0

  const account = await runTransaction(async (tx) => {
    if (makePrimary) {
      await bankAccountRepo.updateManyByUser(userId, { isPrimary: false }, tx)
    }
    return bankAccountRepo.create({
      userId,
      bankName: input.bankName,
      accountNumber: encrypt(input.accountNumber),
      accountType: input.accountType,
      branchCode: input.branchCode,
      isPrimary: makePrimary,
    }, tx)
  })

  await writeAuditLog({
    userId,
    action: 'BANK_ACCOUNT_ADDED',
    entity: 'BankAccount',
    entityId: account.id,
    payload: { bankName: input.bankName, accountType: input.accountType },
    ipAddress,
  })

  return {
    id: account.id,
    bankName: account.bankName,
    accountNumberMasked: maskAccountNumber(input.accountNumber),
    accountType: account.accountType,
    branchCode: account.branchCode,
    isPrimary: account.isPrimary,
  }
}

export async function updateBankAccount(
  accountId: string,
  userId: string,
  input: UpdateBankAccountInput,
  ipAddress?: string,
) {
  const account = await bankAccountRepo.findByIdAndUser(accountId, userId)
  if (!account) throw new BankAccountNotFoundError()

  if (account.verifiedAt && (input.bankName || input.branchCode || input.accountType)) {
    throw new BankAccountConflictError('Verified accounts cannot be edited', 'BNK_003')
  }

  await runTransaction(async (tx) => {
    if (input.isPrimary) {
      await bankAccountRepo.updateManyByUser(userId, { isPrimary: false }, tx)
    }
    await bankAccountRepo.update(accountId, {
      ...(input.bankName && { bankName: input.bankName }),
      ...(input.accountType && { accountType: input.accountType }),
      ...(input.branchCode && { branchCode: input.branchCode }),
      ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
    }, tx)
  })

  await writeAuditLog({
    userId,
    action: 'BANK_ACCOUNT_UPDATED',
    entity: 'BankAccount',
    entityId: accountId,
    payload: { fields: Object.keys(input) },
    ipAddress,
  })
}

export async function removeBankAccount(accountId: string, userId: string, ipAddress?: string) {
  // Every mandate, not only the live ones. The foreign key from payment_mandates
  // is ON DELETE RESTRICT, so a cancelled mandate blocks the delete just as
  // firmly as an active one. Checking only for active mandates told a member to
  // cancel theirs and then failed the delete anyway, on a raw constraint error.
  const account = (await bankAccountRepo.findByIdAndUser(accountId, userId, {
    mandates: true,
  })) as Prisma.BankAccountGetPayload<{ include: { mandates: true } }> | null
  if (!account) throw new BankAccountNotFoundError()

  const live = account.mandates.filter((m) => m.status === 'PENDING' || m.status === 'ACTIVE')
  if (live.length > 0) {
    // Actionable: cancelling really does move this forward.
    throw new BankAccountConflictError('Cannot remove an account with an active mandate', 'BNK_004')
  }
  if (account.mandates.length > 0) {
    // Not actionable, so it must not read like it is. The mandate is over, but
    // it is a financial record that names this account and is kept.
    throw new BankAccountConflictError(
      'This account is attached to a past debit order and is kept as part of your payment records. It cannot be removed.',
      'BNK_006',
    )
  }

  try {
    await runTransaction(async (tx) => {
      await bankAccountRepo.delete(accountId, tx)
      if (account.isPrimary) {
        const next = await bankAccountRepo.findFirst({ userId }, { createdAt: 'asc' }, tx)
        if (next) await bankAccountRepo.update(next.id, { isPrimary: true }, tx)
      }
    })
  } catch (err) {
    // A mandate created between the check above and the delete lands here. The
    // database is right and the member should be told so, not shown a 500.
    if (isForeignKeyViolation(err, 'payment_mandates_bankAccountId_fkey')) {
      throw new BankAccountConflictError(
        'This account is attached to a debit order and cannot be removed.',
        'BNK_006',
      )
    }
    throw err
  }

  await writeAuditLog({
    userId,
    action: 'BANK_ACCOUNT_REMOVED',
    entity: 'BankAccount',
    entityId: accountId,
    ipAddress,
  })
}

// ─── Notification preferences ─────────────────────────────────────────────────

export async function getNotificationPreferences(userId: string) {
  return notificationRepo.upsertPreference(userId, {})
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferencesInput,
  ipAddress?: string,
) {
  const prefs = await notificationRepo.upsertPreference(userId, input)

  await writeAuditLog({
    userId,
    action: 'NOTIFICATION_PREFS_UPDATED',
    entity: 'NotificationPreference',
    entityId: userId,
    payload: input,
    ipAddress,
  })

  return prefs
}

// ─── WhatsApp preference (single-channel toggle) ────────────────────────────

/** The member's WhatsApp opt-in state plus the phone WhatsApp would target. */
export async function getWhatsappPreference(userId: string) {
  const [user, pref] = await Promise.all([
    userRepo.findById(userId, { select: { phone: true } }) as Promise<{ phone: string | null } | null>,
    notificationRepo.findPreference(userId),
  ])
  return { enabled: pref?.whatsapp ?? true, phone: user?.phone ?? null }
}

export async function setWhatsappPreference(
  userId: string,
  enabled: boolean,
  ipAddress?: string,
) {
  const pref = await notificationRepo.upsertPreference(userId, { whatsapp: enabled })

  await writeAuditLog({
    userId,
    action: 'WHATSAPP_PREFERENCE_UPDATED',
    entity: 'NotificationPreference',
    entityId: userId,
    payload: { enabled },
    ipAddress,
  })

  return { enabled: pref.whatsapp }
}

// ─── Authenticated user (own profile, /me) ──────────────────────────────────

/** Compact self-profile for the session endpoint; null when the user is gone. */
export async function getAuthenticatedUser(userId: string) {
  type MeUser = Prisma.UserGetPayload<{
    select: {
      id: true
      email: true
      phone: true
      firstName: true
      lastName: true
      status: true
      emailVerified: true
      createdAt: true
      roles: { select: { role: { select: { name: true } } } }
    }
  }>

  const user = (await userRepo.findById(userId, {
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      status: true,
      emailVerified: true,
      createdAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  })) as MeUser | null

  if (!user) return null

  return { ...user, roles: user.roles.map((r) => r.role.name) }
}
