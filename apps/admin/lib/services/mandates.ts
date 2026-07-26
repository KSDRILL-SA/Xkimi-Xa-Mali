import type { MandateStatus } from '@prisma/client'
import { db, Prisma } from '@/lib/db'
import { assertAdmin, notifyInbox, writeAuditLog, AdminNotFoundError, AdminConflictError } from './shared'

// ─── Mandates ─────────────────────────────────────────────────────────────────

export async function listAllMandates(
  adminRoles: string[],
  params: { status?: string; page?: number; limit?: number } = {},
) {
  assertAdmin(adminRoles)
  const { status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit
  const where: Prisma.PaymentMandateWhereInput = {
    ...(status && { status: status as MandateStatus }),
  }

  const [items, total] = await Promise.all([
    db.paymentMandate.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, amount: true, debitDay: true,
        createdAt: true, netcashMandateId: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        bankAccount: { select: { bankName: true, accountType: true } },
      },
    }),
    db.paymentMandate.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function approveMandate(
  adminId: string, adminRoles: string[], mandateId: string, ip?: string,
) {
  assertAdmin(adminRoles)
  const mandate = await db.paymentMandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true, userId: true } })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')
  if (mandate.status !== 'PENDING') throw new AdminConflictError('Only PENDING mandates can be approved')

  const updated = await db.paymentMandate.update({
    where: { id: mandateId }, data: { status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId }, select: { id: true, status: true },
  })
  await writeAuditLog({ userId: adminId, action: 'ADMIN_MANDATE_APPROVED', entity: 'PaymentMandate', entityId: mandateId, payload: { memberId: mandate.userId }, ipAddress: ip })
  await notifyInbox({
    userId: mandate.userId, createdById: adminId, category: 'PAYMENT',
    title: 'Payment mandate approved ✅',
    body: 'Your debit-order mandate has been approved. Your monthly contributions will now be collected automatically.',
  })
  return updated
}

export async function rejectMandate(
  adminId: string, adminRoles: string[], mandateId: string, ip?: string,
) {
  assertAdmin(adminRoles)
  const mandate = await db.paymentMandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true, userId: true } })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')
  if (mandate.status === 'CANCELLED') throw new AdminConflictError('Mandate is already cancelled')

  const updated = await db.paymentMandate.update({
    where: { id: mandateId }, data: { status: 'CANCELLED' }, select: { id: true, status: true },
  })
  await writeAuditLog({ userId: adminId, action: 'ADMIN_MANDATE_REJECTED', entity: 'PaymentMandate', entityId: mandateId, payload: { memberId: mandate.userId }, ipAddress: ip })
  await notifyInbox({
    userId: mandate.userId, createdById: adminId, category: 'PAYMENT',
    title: 'Payment mandate not approved',
    body: 'Your debit-order mandate was not approved. Please review your bank details and submit a new mandate.',
  })
  return updated
}
