import { Prisma } from '@prisma/client'
import { auditRepo } from '@/repositories/audit.repository'

type AuditParams = {
  userId?: string
  action: string
  entity: string
  entityId: string
  payload?: Prisma.InputJsonValue
  ipAddress?: string
}

export async function writeAuditLog({ userId, action, entity, entityId, payload, ipAddress }: AuditParams) {
  await auditRepo.create({
    userId: userId ?? null,
    action,
    entity,
    entityId,
    payload: payload ?? {},
    ipAddress: ipAddress ?? null,
  })
}
