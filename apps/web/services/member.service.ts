import { db } from '@/lib/db'
import { encrypt, decrypt, maskAccountNumber } from '@/lib/encryption'
import { writeAuditLog } from './audit.service'
import { logger } from '@/lib/logger'
import {
  ForbiddenError,
  MemberNotFoundError,
  BankAccountNotFoundError,
  BankAccountConflictError,
} from '@/lib/errors'
import type {
  UpdateProfileInput,
  CreateBankAccountInput,
  UpdateBankAccountInput,
  NotificationPreferencesInput,
} from '@/lib/validation/profile'

// Members may only access their own resources; admins may access anyone's. [SEC-L4]
function assertCanAccess(targetUserId: string, requesterId: string, requesterRoles: string[]) {
  if (targetUserId !== requesterId && !requesterRoles.includes('ADMIN')) {
    throw new ForbiddenError('You do not have access to this resource')
  }
}

function maskIdNumber(encrypted: string | null): string | null {
  if (!encrypted) return null
  const plain = decrypt(encrypted)
  return plain.slice(-4).padStart(plain.length, '*')
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getMemberProfile(
  targetUserId: string,
  requesterId: string,
  requesterRoles: string[],
) {
  assertCanAccess(targetUserId, requesterId, requesterRoles)

  const user = await db.user.findUnique({
    where: { id: targetUserId },
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
  })

  if (!user) throw new MemberNotFoundError()

  return {
    ...user,
    idNumberMasked: maskIdNumber(user.idNumber),
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
    const clash = await db.user.findFirst({
      where: { phone: input.phone, id: { not: targetUserId } },
    })
    if (clash) throw new BankAccountConflictError('That phone number is already in use', 'MBR_003')
  }

  const updated = await db.user.update({
    where: { id: targetUserId },
    data: {
      ...(input.firstName && { firstName: input.firstName }),
      ...(input.lastName && { lastName: input.lastName }),
      ...(input.phone && { phone: input.phone }),
      ...(input.address && { address: input.address }),
    },
    select: { id: true, firstName: true, lastName: true, phone: true, address: true },
  })

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

  const [contributions, activeMandate] = await Promise.all([
    db.contribution.findMany({
      where: { userId: targetUserId },
      select: { amountPaid: true, status: true, periodYear: true },
    }),
    db.paymentMandate.findFirst({
      where: { userId: targetUserId, status: 'ACTIVE' },
      select: { id: true, amount: true, debitDay: true },
    }),
  ])

  const totalContributed = contributions.reduce((sum, c) => sum + Number(c.amountPaid), 0)
  const yearlyContributed = contributions
    .filter((c) => c.periodYear === currentYear)
    .reduce((sum, c) => sum + Number(c.amountPaid), 0)

  return {
    totalContributed,
    yearlyContributed,
    paidCount: contributions.filter((c) => c.status === 'PAID').length,
    overdueCount: contributions.filter((c) => c.status === 'OVERDUE').length,
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

  const user = await db.user.findUnique({
    where: { id: targetUserId },
    include: {
      roles: { include: { role: true } },
      bankAccounts: true,
      mandates: true,
      contributions: { include: { transactions: true } },
      notifications: true,
      notificationPreference: true,
    },
  })

  if (!user) throw new MemberNotFoundError()

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
      idNumber: user.idNumber ? decrypt(user.idNumber) : null,
      address: user.address,
      status: user.status,
      popiaConsentAt: user.popiaConsentAt,
      createdAt: user.createdAt,
      roles: user.roles.map((r) => r.role.name),
    },
    bankAccounts: user.bankAccounts.map((a) => ({
      bankName: a.bankName,
      accountNumber: decrypt(a.accountNumber),
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
    notificationPreferences: user.notificationPreference ?? { sms: true, email: true, push: true },
  }
}

// ─── Bank accounts ────────────────────────────────────────────────────────────

export async function listBankAccounts(userId: string) {
  const accounts = await db.bankAccount.findMany({
    where: { userId },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  })

  return accounts.map((a) => ({
    id: a.id,
    bankName: a.bankName,
    accountNumberMasked: maskAccountNumber(decrypt(a.accountNumber)),
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
  const existingCount = await db.bankAccount.count({ where: { userId } })
  const makePrimary = input.isPrimary || existingCount === 0

  const account = await db.$transaction(async (tx) => {
    if (makePrimary) {
      await tx.bankAccount.updateMany({ where: { userId }, data: { isPrimary: false } })
    }
    return tx.bankAccount.create({
      data: {
        userId,
        bankName: input.bankName,
        accountNumber: encrypt(input.accountNumber),
        accountType: input.accountType,
        branchCode: input.branchCode,
        isPrimary: makePrimary,
      },
    })
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
  const account = await db.bankAccount.findFirst({ where: { id: accountId, userId } })
  if (!account) throw new BankAccountNotFoundError()

  if (account.verifiedAt && (input.bankName || input.branchCode || input.accountType)) {
    throw new BankAccountConflictError('Verified accounts cannot be edited', 'BNK_003')
  }

  await db.$transaction(async (tx) => {
    if (input.isPrimary) {
      await tx.bankAccount.updateMany({ where: { userId }, data: { isPrimary: false } })
    }
    await tx.bankAccount.update({
      where: { id: accountId },
      data: {
        ...(input.bankName && { bankName: input.bankName }),
        ...(input.accountType && { accountType: input.accountType }),
        ...(input.branchCode && { branchCode: input.branchCode }),
        ...(input.isPrimary !== undefined && { isPrimary: input.isPrimary }),
      },
    })
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
  const account = await db.bankAccount.findFirst({
    where: { id: accountId, userId },
    include: { mandates: { where: { status: { in: ['PENDING', 'ACTIVE'] } } } },
  })
  if (!account) throw new BankAccountNotFoundError()

  if (account.mandates.length > 0) {
    throw new BankAccountConflictError('Cannot remove an account with an active mandate', 'BNK_004')
  }

  await db.bankAccount.delete({ where: { id: accountId } })

  if (account.isPrimary) {
    const next = await db.bankAccount.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } })
    if (next) await db.bankAccount.update({ where: { id: next.id }, data: { isPrimary: true } })
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
  return db.notificationPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { sms: true, email: true, push: true },
  })
}

export async function updateNotificationPreferences(
  userId: string,
  input: NotificationPreferencesInput,
  ipAddress?: string,
) {
  const prefs = await db.notificationPreference.upsert({
    where: { userId },
    update: input,
    create: { userId, ...input },
    select: { sms: true, email: true, push: true },
  })

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
