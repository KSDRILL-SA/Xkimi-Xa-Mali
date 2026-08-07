import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { leaveFoundation } from '@/services/mandate.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

/**
 * A member leaves the Foundation.
 *
 * Self-service and immediate — the guide says "at any time", twice, and a
 * leaving that waits on a leader reading their inbox makes that untrue.
 *
 * Only ever acts on the caller's own account. There is no id in the path for
 * the same reason there is none in `getMyInvitation`: an endpoint that can only
 * do one thing to one person cannot be pointed at somebody else.
 *
 * Requires the member to type the confirmation phrase. This is irreversible
 * without leadership putting them back, and a bare POST is one mis-tap away.
 */
const CONFIRM_PHRASE = 'LEAVE'

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const { confirm } = (body ?? {}) as { confirm?: unknown }
  if (typeof confirm !== 'string' || confirm.trim().toUpperCase() !== CONFIRM_PHRASE) {
    return apiError('VAL_002', `Type ${CONFIRM_PHRASE} to confirm`, 400)
  }

  const result = await leaveFoundation(session.user.id, getClientIP(req))
  return apiSuccess(result)
})
