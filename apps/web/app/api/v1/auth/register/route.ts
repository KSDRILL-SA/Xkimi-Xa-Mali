import { NextRequest } from 'next/server'
import { authRatelimit } from '@/lib/redis'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  acceptInviteRegistration,
  InviteNotFoundError, InviteUsedError, InviteRevokedError,
  InviteExpiredError, InviteBindingError,
} from '@/services/invite.service'

const SA_PHONE = /^(\+27|0)[6-8][0-9]{8}$/
const SA_ID    = /^\d{13}$/

function validateSAId(id: string): boolean {
  let sum = 0; let alt = false
  for (let i = id.length - 1; i >= 0; i--) {
    let n = parseInt(id[i], 10)
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    sum += n; alt = !alt
  }
  return sum % 10 === 0
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  const { success } = await authRatelimit.limit(ip)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  let body: unknown
  try { body = await req.json() } catch { return apiError('SYS_001', 'Invalid request body', 400) }

  const b = body as Record<string, unknown>

  if (typeof b.inviteCode !== 'string' || !b.inviteCode.trim())
    return apiError('VAL_001', '"inviteCode" is required', 400)
  if (typeof b.email !== 'string' || !b.email.includes('@'))
    return apiError('VAL_002', '"email" must be a valid email address', 400)
  if (typeof b.phone !== 'string' || !SA_PHONE.test(b.phone))
    return apiError('VAL_003', '"phone" must be a valid SA mobile number', 400)
  if (typeof b.firstName !== 'string' || b.firstName.trim().length < 2)
    return apiError('VAL_004', '"firstName" must be at least 2 characters', 400)
  if (typeof b.lastName !== 'string' || b.lastName.trim().length < 2)
    return apiError('VAL_005', '"lastName" must be at least 2 characters', 400)
  if (b.idNumber !== undefined) {
    if (typeof b.idNumber !== 'string' || !SA_ID.test(b.idNumber) || !validateSAId(b.idNumber))
      return apiError('VAL_006', '"idNumber" must be a valid 13-digit SA ID number', 400)
  }
  if (typeof b.password !== 'string' || b.password.length < 8 || !/[A-Z]/.test(b.password) || !/[0-9]/.test(b.password))
    return apiError('VAL_007', '"password" must be at least 8 characters with 1 uppercase and 1 number', 400)
  if (b.consentToPopia !== true)
    return apiError('VAL_008', 'You must consent to the privacy policy', 400)

  try {
    const baseUrl = new URL(req.url).origin
    const result = await acceptInviteRegistration(
      {
        inviteCode:     b.inviteCode.trim().toUpperCase(),
        email:          (b.email as string).toLowerCase().trim(),
        phone:          b.phone as string,
        firstName:      (b.firstName as string).trim(),
        lastName:       (b.lastName  as string).trim(),
        idNumber:       b.idNumber as string | undefined,
        password:       b.password as string,
        consentToPopia: true,
      },
      baseUrl,
      ip,
    )
    return apiSuccess(
      { message: 'Registration successful. Please check your email to verify your account.', userId: result.userId },
      201,
    )
  } catch (e) {
    if (e instanceof InviteNotFoundError) return apiError(e.code, e.message, 400)
    if (e instanceof InviteUsedError)     return apiError(e.code, e.message, 400)
    if (e instanceof InviteRevokedError)  return apiError(e.code, e.message, 400)
    if (e instanceof InviteExpiredError)  return apiError(e.code, e.message, 400)
    if (e instanceof InviteBindingError)  return apiError(e.code, e.message, 403)
    return apiError('SYS_004', 'Registration failed. Please try again.', 500)
  }
}
