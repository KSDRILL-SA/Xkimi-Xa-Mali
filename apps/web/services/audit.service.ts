import { db } from '@/lib/db'

type AuditParams = {
  userId?: string
  action: string
  entity: string
  entityId: string
  payload?: Record<string, unknown>
  ipAddress?: string
}

export async function writeAuditLog({ userId, action, entity, entityId, payload = {}, ipAddress }: AuditParams) {
  await db.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entity,
      entityId,
      payload,
      ipAddress: ipAddress ?? null,
    },
  })
}
