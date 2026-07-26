import { logger } from '@xxm/observability'
import { db, Prisma } from '@/lib/db'

// ─── Errors ───────────────────────────────────────────────────────────────────

export class AdminForbiddenError extends Error {
  code = 'SYS_003'; status = 403
  constructor() { super('Admin access required') }
}
export class AdminNotFoundError extends Error {
  code = 'ADM_001'; status = 404
  constructor(msg = 'Resource not found') { super(msg) }
}
export class AdminConflictError extends Error {
  code = 'ADM_002'; status = 409
  constructor(msg: string) { super(msg) }
}
export class SignatureLockError extends Error {
  code = 'SIG_002'; status = 423
  nextChangeAllowedAt: string
  constructor(nextChangeAllowedAt: Date) {
    super('Signature can only be changed once every 90 days')
    this.nextChangeAllowedAt = nextChangeAllowedAt.toISOString()
  }
}

export function assertAdmin(roles: string[]) {
  if (!roles.includes('ADMIN')) throw new AdminForbiddenError()
}

/**
 * Round a rand amount to 2 decimal places, eliminating binary-float dust
 * (0.1 + 0.2 → 0.30000000000000004). Money is stored and aggregated exactly by
 * Postgres DECIMAL; this guards the few places a total crosses into JS.
 */
export function roundZAR(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

// ─── Proactive in-app notification ──────────────────────────────────────────────
// Best-effort: the system keeps members informed in their inbox. A failure here
// must never break the underlying admin action that triggered it.
export async function notifyInbox(opts: {
  userId: string
  title: string
  body: string
  category?: 'BROADCAST' | 'SYSTEM' | 'PAYMENT' | 'GOAL'
  createdById?: string
}) {
  try {
    await db.inboxMessage.create({
      data: {
        userId:      opts.userId,
        title:       opts.title,
        body:        opts.body,
        category:    opts.category ?? 'SYSTEM',
        createdById: opts.createdById ?? null,
      },
    })
  } catch (err) {
    logger.error('Inbox notify failed', { err, userId: opts.userId })
  }
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

export async function writeAuditLog(data: {
  userId?: string | null
  action: string
  entity: string
  entityId: string
  payload?: unknown
  ipAddress?: string | null
}) {
  await db.auditLog.create({
    data: {
      userId:    data.userId ?? null,
      action:    data.action,
      entity:    data.entity,
      entityId:  data.entityId,
      payload:   (data.payload ?? {}) as Prisma.InputJsonValue,
      ipAddress: data.ipAddress ?? null,
    },
  })
}
