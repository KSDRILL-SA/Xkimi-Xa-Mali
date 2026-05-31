import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

export const auditRepo = {
  create(data: Prisma.AuditLogUncheckedCreateInput) {
    return db.auditLog.create({ data })
  },

  findMany(where: Prisma.AuditLogWhereInput, opts?: { skip?: number; take?: number; orderBy?: Prisma.AuditLogOrderByWithRelationInput; select?: Prisma.AuditLogSelect }) {
    return db.auditLog.findMany({
      ...(where && { where }),
      ...(opts?.skip !== undefined && { skip: opts.skip }),
      ...(opts?.take !== undefined && { take: opts.take }),
      ...(opts?.orderBy && { orderBy: opts.orderBy }),
      ...(opts?.select && { select: opts.select }),
    })
  },

  count(where?: Prisma.AuditLogWhereInput) {
    return db.auditLog.count({ ...(where && { where }) })
  },
}
