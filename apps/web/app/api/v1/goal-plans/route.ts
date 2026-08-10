import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { env } from '@/lib/env'
import { enrolInPlan, getMyPlans, suggestPlan } from '@/services/goal-plan.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

const EnrolSchema = z.object({
  goalId: z.string().min(1),
  amount: z.number().positive(),
  debitDay: z.number().int().min(1).max(31),
})

/**
 * A member's plans, or — with `?goalId=` — what a plan for that goal would look
 * like before they commit to one.
 */
export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const goalId = req.nextUrl.searchParams.get('goalId')
  if (goalId) {
    return apiSuccess(await suggestPlan(goalId, session.user.id, session.user.id, session.user.roles ?? []))
  }
  return apiSuccess(await getMyPlans(session.user.id, session.user.id, session.user.roles ?? []))
})

/**
 * Start a monthly commitment to a goal.
 *
 * Behind ENABLE_MANUAL_PAYMENTS like the one-off goal payment: a plan is a
 * standing instruction to collect, so leaving it open while manual payments are
 * disabled would let members queue up collections the kill switch was meant to
 * stop.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  if (!env.ENABLE_MANUAL_PAYMENTS) {
    return apiError('SYS_006', 'Manual payments are currently disabled', 403)
  }

  const body = await req.json().catch(() => null)
  const parsed = EnrolSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const plan = await enrolInPlan(
    parsed.data.goalId,
    session.user.id,
    session.user.id,
    session.user.roles ?? [],
    parsed.data.amount,
    parsed.data.debitDay,
    getClientIP(req),
  )
  return apiSuccess({ planId: plan.id, amount: Number(plan.amount), debitDay: plan.debitDay }, 201)
})
