import { NextRequest } from 'next/server'
import type { BadgeTier } from '@prisma/client'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getAllBadgesWithScores } from '@/services/badge.service'
import { withApiHandler } from '@/lib/api-handler'

const VALID_TIERS = ['AMATEUR', 'SEMI_PRO', 'PRO', 'WORLD_CLASS']

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')))
  const tierParam = searchParams.get('tier')
  const tier = tierParam && VALID_TIERS.includes(tierParam) ? (tierParam as BadgeTier) : undefined

  const result = await getAllBadgesWithScores(roles, { page, limit, tier })
  return apiSuccess(result.items, 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  })
})
