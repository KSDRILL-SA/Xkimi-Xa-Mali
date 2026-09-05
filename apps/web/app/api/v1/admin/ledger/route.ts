import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getLedger, getPoolBalance } from '@/services/ledger.service'
import { withApiHandler } from '@/lib/api-handler'
import { verifyInternalRequest } from '@/lib/internal-request'

export const GET = withApiHandler(async (req: NextRequest) => {
  const isTrusted = await verifyInternalRequest(req)
  const session   = isTrusted ? null : await auth()
  if (!isTrusted && !session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = isTrusted ? ['ADMIN'] : (session?.user?.roles as string[] | undefined) ?? []
  if (!isTrusted && !roles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))

  const [balance, ledger] = await Promise.all([getPoolBalance(), getLedger({ page })])
  return apiSuccess({ balance, ...ledger })
})
