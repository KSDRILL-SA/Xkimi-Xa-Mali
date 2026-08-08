import { NextRequest } from 'next/server'
import { authRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { apiSuccess, apiError } from '@/lib/api-response'
import { acceptInviteRegistration } from '@/services/invite.service'
import { withApiHandler } from '@/lib/api-handler'
import { PasswordSchema } from '@xxm/utils/schemas'

const SA_PHONE = /^(\+27|0)[6-8][0-9]{8}$/
const SA_ID    = /^\d{13}$/

function validateSAId(id: string): boolean {
  let sum = 0; let alt = false
  for (let i = id.length - 1; i >= 0; i--) {
    let n = parseInt(id.charAt(i), 10)
    if (alt) { n *= 2; if (n > 9) n -= 9 }
    sum += n; alt = !alt
  }
  return sum % 10 === 0
}

export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIP(req) ?? 'unknown'

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
  // The shared rule, not a second copy of it. This route hand-rolled eight
  // characters with one uppercase and one digit while every other password path
  // in the codebase required twelve — so the only endpoint that creates an
  // account enforced the weakest rule in the system, and it was the rule
  // `PasswordSchema`'s own comment argues against.
  const password = PasswordSchema.safeParse(b.password)
  if (!password.success)
    return apiError('VAL_007', password.error.errors[0]?.message ?? 'Password is not strong enough', 400)
  if (b.consentToPopia !== true)
    return apiError('VAL_008', 'You must consent to the privacy policy', 400)

  const baseUrl = new URL(req.url).origin
  const result = await acceptInviteRegistration(
    {
      inviteCode:     b.inviteCode.trim().toUpperCase(),
      email:          (b.email as string).toLowerCase().trim(),
      phone:          b.phone as string,
      firstName:      (b.firstName as string).trim(),
      lastName:       (b.lastName  as string).trim(),
      idNumber:       b.idNumber as string | undefined,
      password:       password.data,
      consentToPopia: true,
    },
    baseUrl,
    ip,
  )
  // The account is created either way. What differs is whether the link is on
  // its way, and telling someone to "check your email" when nothing was sent is
  // how they end up waiting instead of asking for another one.
  return apiSuccess(
    {
      message: result.verificationEmailSent
        ? 'Registration successful. Please check your email to verify your account.'
        : 'Your account was created, but the verification email could not be sent. ' +
          'Use "Resend verification email" on the sign-in page to request a new link.',
      userId: result.userId,
      verificationEmailSent: result.verificationEmailSent,
    },
    201,
  )
})
