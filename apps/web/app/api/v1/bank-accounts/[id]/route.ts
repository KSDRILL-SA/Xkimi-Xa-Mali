import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { UpdateBankAccountSchema } from '@/lib/validation/profile'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { updateBankAccount, removeBankAccount } from '@/services/member.service'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = UpdateBankAccountSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  try {
    await updateBankAccount(id, session.user.id, parsed.data, ip)
    return apiSuccess({ message: 'Bank account updated' })
  } catch (err) {
    return handleServiceError(err)
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  try {
    await removeBankAccount(id, session.user.id, ip)
    return apiSuccess({ message: 'Bank account removed' })
  } catch (err) {
    return handleServiceError(err)
  }
}
