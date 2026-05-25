import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { CreateBankAccountSchema } from '@/lib/validation/profile'
import { apiSuccess, apiError } from '@/lib/api-response'
import { listBankAccounts, addBankAccount } from '@/services/member.service'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const accounts = await listBankAccounts(session.user.id)
  return apiSuccess(accounts)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = CreateBankAccountSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  try {
    const account = await addBankAccount(session.user.id, parsed.data, ip)
    return apiSuccess(account, 201)
  } catch (err) {
    console.error('[bank-accounts]', err)
    return apiError('SYS_004', 'Failed to add bank account', 500)
  }
}
