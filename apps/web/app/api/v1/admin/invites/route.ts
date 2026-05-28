import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  createInvite, listInvites,
  InviteForbiddenError, InviteDuplicateEmailError,
} from '@/services/invite.service'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { searchParams } = new URL(req.url)
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  try {
    const result = await listInvites(roles, page, limit)
    return apiSuccess(result.items, 200, {
      page: result.page, limit: result.limit,
      total: result.total, totalPages: result.totalPages,
    })
  } catch (e) {
    if (e instanceof InviteForbiddenError) return apiError(e.code, e.message, 403)
    throw e
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const email = (body as Record<string, unknown>).email
  if (typeof email !== 'string' || !email.includes('@'))
    return apiError('VAL_002', '"email" must be a valid email address', 400)

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const result = await createInvite(session.user.id, roles, email.toLowerCase().trim(), baseUrl, ip)
    return apiSuccess(result, 201)
  } catch (e) {
    if (e instanceof InviteForbiddenError)    return apiError(e.code, e.message, 403)
    if (e instanceof InviteDuplicateEmailError) return apiError(e.code, e.message, 409)
    throw e
  }
}
