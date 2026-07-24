import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { CreateBankAccountSchema } from '@/lib/validation/profile'
import { apiSuccess, apiError } from '@/lib/api-response'
import { listBankAccounts, addBankAccount } from '@/services/member.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const accounts = await listBankAccounts(session.user.id)
  return apiSuccess(accounts)
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = CreateBankAccountSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const ip = getClientIP(req) ?? 'unknown'

  const account = await addBankAccount(session.user.id, parsed.data, ip)
  return apiSuccess(account, 201)
})
