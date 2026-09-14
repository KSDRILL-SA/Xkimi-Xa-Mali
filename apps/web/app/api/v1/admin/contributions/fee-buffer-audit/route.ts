import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { findFeeBufferRetroCandidates } from '@/services/contribution.service'
import { withApiHandler } from '@/lib/api-handler'

/**
 * Read-only. Lists contributions recorded overpaid by no more than
 * NETCASH_FEE_BUFFER, from before the fee-buffer carve-out existed — the list
 * a person reads before deciding what to do with any of them. Temporary: this
 * route exists for the one-time historical correction and is removed once
 * that has run.
 */
export const GET = withApiHandler(async (_req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = session.user.roles as string[] | undefined
  if (!roles?.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const candidates = await findFeeBufferRetroCandidates()
  return apiSuccess({ count: candidates.length, candidates })
})
