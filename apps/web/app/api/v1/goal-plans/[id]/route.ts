import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { cancelPlan, resumePlan } from '@/services/goal-plan.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

const ActionSchema = z.object({ action: z.enum(['resume']) })

/** Stop a plan. Terminal — money already collected stays with the goal. */
export const DELETE = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  return apiSuccess(
    await cancelPlan(id, session.user.id, session.user.id, session.user.roles ?? [], getClientIP(req)),
  )
})

/**
 * Restart a paused plan.
 *
 * A PATCH rather than a second collection route because the plan already
 * exists and this changes its state. The collection job pauses plans by itself
 * when a mandate disappears, so without this a member who fixed their debit
 * order had no way back.
 */
export const PATCH = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const body = await req.json().catch(() => null)
  const parsed = ActionSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', 'Unsupported action', 422)
  }

  const { id } = await params
  return apiSuccess(
    await resumePlan(id, session.user.id, session.user.id, session.user.roles ?? [], getClientIP(req)),
  )
})
