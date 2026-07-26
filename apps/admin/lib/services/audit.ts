import { db } from '@/lib/db'
import { assertAdmin } from './shared'

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function listAuditLogs(
  adminRoles: string[],
  params: { entity?: string; action?: string; userId?: string; page?: number; limit?: number } = {},
) {
  assertAdmin(adminRoles)
  const { entity, action, userId, page = 1, limit = 30 } = params
  const skip = (page - 1) * limit

  const where = {
    ...(entity && { entity }),
    ...(action && { action: { contains: action, mode: 'insensitive' as const } }),
    ...(userId && { userId }),
  }

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, action: true, entity: true, entityId: true,
        payload: true, ipAddress: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}
