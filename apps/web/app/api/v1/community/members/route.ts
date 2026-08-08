import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getCommunityBadges } from '@/services/badge.service'
import { withFounderFlag } from '@/services/distinction.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (_req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const members = await withFounderFlag(await getCommunityBadges())
  return apiSuccess(members)
})
