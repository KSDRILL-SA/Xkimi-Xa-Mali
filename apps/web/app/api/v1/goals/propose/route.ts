import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { CreateGoalSchema } from '@/lib/validation/goal'
import { proposeGoal } from '@/services/goal.service'
import { withApiHandler } from '@/lib/api-handler'
import { goalProposalRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'

/**
 * A member proposes a Goal — step 1 of the guide's six-step flow.
 *
 * Separate from `POST /api/v1/goals`, which is the leadership path and creates
 * an approved-by-default draft. Splitting them keeps `createGoal`'s admin
 * assertion exactly where it was: a member reaching the wrong door is refused
 * by the service rather than by a role check this route might get wrong.
 *
 * Any authenticated member may propose. That is the point of the gap — the
 * flow began with something only leadership could do.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  // Per member, not per IP: a proposal lands in every leader's inbox, so the
  // thing worth limiting is how often one person can put something there.
  const { success } = await goalProposalRatelimit.limit(session.user.id)
  if (!success) {
    return apiError('SYS_005', 'You have proposed several Goals recently. Please try again later.', 429)
  }

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const parsed = CreateGoalSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_002', parsed.error.issues[0]?.message ?? 'Invalid payload', 400)
  }

  const goal = await proposeGoal(parsed.data, session.user.id, getClientIP(req) ?? '')
  return apiSuccess(goal, 201)
})
