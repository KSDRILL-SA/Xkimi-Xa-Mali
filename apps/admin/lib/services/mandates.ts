import type { MandateStatus } from '@prisma/client'
import { internalAdminPost } from '@/lib/api'
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
  /** Why it was refused. Told to the member, and kept in the audit trail. */
  reason?: string,
) {
  assertAdmin(adminRoles)
  const mandate = await db.paymentMandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true, userId: true } })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')

  if (mandate.status === 'CANCELLED') throw new AdminConflictError('Mandate is already cancelled')

  // Turning down a waiting request and stopping a live debit order are both
  // needed, and both come through here. The member app decides which message
  // the member gets, because it is the one that knows — and because telling
  // somebody their mandate "was not approved" when it had been approved and
  // then stopped is two lies in one sentence.

  const trimmedReason = reason?.trim() ?? ''
  if (trimmedReason.length < 10) {
    throw new AdminConflictError(
      'Give a reason of at least 10 characters — the member is told why, and it is recorded.',
    )
  }

  // Through the member app rather than straight to the database.
  //
  // The authorisation exists at Netcash before the local row does, and this app
  // has no gateway access at all. Writing CANCELLED here and stopping left the
  // bank still holding permission to debit this member while our records said
  // otherwise — with nothing raised, because the code that raises it lives on
  // the other side. That app owns the gateway, so it owns this.
  const res = await internalAdminPost(`/api/v1/admin/mandates/${mandateId}/reject`, {
    reason: trimmedReason,
  }, { adminUserId: adminId, adminIp: ip })

  if (!res.ok) {
    throw new AdminConflictError(res.error?.message ?? 'Could not reject this mandate')
  }
  const updated = { id: mandateId, status: 'CANCELLED' as const }
  // No audit entry and no message from here. The member app writes both as part
  // of the same call, and it now knows the reason — so doing it again would
  // record the rejection twice and tell the member twice. The message it sends
  // also carries why, rather than this one's guess that their bank details were
  // wrong, which was said whatever the actual reason had been.
  return updated
}
