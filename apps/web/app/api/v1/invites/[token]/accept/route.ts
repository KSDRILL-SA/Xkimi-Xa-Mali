import { NextRequest } from 'next/server'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  acceptInvite, type AcceptInviteInput,
  InviteNotFoundError, InviteExpiredError, InviteAlreadyAcceptedError,
} from '@/services/invite.service'

const SA_PHONE = /^(\+27|0)[6-8][0-9]{8}$/
const SA_ID    = /^\d{13}$/

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const b = body as Record<string, unknown>

  if (typeof b.firstName !== 'string' || b.firstName.trim().length < 2)
    return apiError('VAL_002', '"firstName" must be at least 2 characters', 400)
  if (typeof b.lastName !== 'string' || b.lastName.trim().length < 2)
    return apiError('VAL_003', '"lastName" must be at least 2 characters', 400)
  if (typeof b.phone !== 'string' || !SA_PHONE.test(b.phone))
    return apiError('VAL_004', '"phone" must be a valid SA mobile number', 400)
  if (typeof b.password !== 'string' || b.password.length < 8)
    return apiError('VAL_005', '"password" must be at least 8 characters', 400)
  if (b.idNumber !== undefined && (typeof b.idNumber !== 'string' || !SA_ID.test(b.idNumber)))
    return apiError('VAL_006', '"idNumber" must be 13 digits', 400)
  if (b.consentToPopia !== true)
    return apiError('VAL_007', 'You must consent to the privacy policy', 400)

  const input: AcceptInviteInput = {
    firstName: (b.firstName as string).trim(),
    lastName:  (b.lastName  as string).trim(),
    phone:     b.phone as string,
    password:  b.password as string,
    idNumber:  b.idNumber as string | undefined,
    consentToPopia: true,
  }

  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    const result = await acceptInvite(token, input, ip)
    return apiSuccess(result, 201)
  } catch (e) {
    if (e instanceof InviteNotFoundError)        return apiError(e.code, e.message, 404)
    if (e instanceof InviteExpiredError)         return apiError(e.code, e.message, 410)
    if (e instanceof InviteAlreadyAcceptedError) return apiError(e.code, e.message, 409)
    const ce = e as { code?: string; status?: number; message: string }
    if (ce.status === 409) return apiError(ce.code ?? 'INV_ERR', ce.message, 409)
    throw e
  }
}
