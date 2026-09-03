import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { enrolInPlan, getMyPlans, suggestPlan } from '@/services/goal-plan.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'
import { MEMBER_PAYMENTS_ENABLED, PAYMENTS_DISABLED_MESSAGE } from '@/lib/payments-enabled'

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
 * Behind the same switch as the one-off goal payment: a plan is a standing
 * instruction to collect, so leaving it open while payments are disabled would
 * let members queue up collections the switch was meant to stop.
 *
 * `MEMBER_PAYMENTS_ENABLED` rather than the raw flag, because the flag alone is
 * only somebody's intention — it stayed on while production ran a gateway that
 * moved no money. See lib/payments-enabled.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  if (!MEMBER_PAYMENTS_ENABLED) {
    return apiError('SYS_006', PAYMENTS_DISABLED_MESSAGE, 403)
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
