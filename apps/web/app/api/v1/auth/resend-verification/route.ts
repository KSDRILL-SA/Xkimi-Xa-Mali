import { NextRequest, after } from 'next/server'
import { z } from 'zod'
import { logger } from '@xxm/observability'
import { resendVerificationRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { apiSuccess, apiError } from '@/lib/api-response'
import { resendVerificationEmail } from '@/services/auth.service'
import { withApiHandler } from '@/lib/api-handler'

const Schema = z.object({
  email: z.string().trim().toLowerCase().email(),
})

/**
 * Ask for the verification link again.
 *
 * Registration issued one token and put it in one email. If that email did not
 * arrive, the account was finished — the row existed so the address was taken,
 * the invitation was spent, the status was PENDING so sign-in was refused, and
 * the token had gone with the message. Only a database edit could fix it.
 *
 * Deliberately shaped like `forgot-password`, which solves the same problem for
 * a different token: same generic answer whether or not the address is
 * registered, same deferral of the work so the timing does not answer the
 * question the wording refuses to.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIP(req) ?? 'unknown'

  const { success } = await resendVerificationRatelimit.limit(ip)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', 'A valid email address is required.', 400)

  const baseUrl = new URL(req.url).origin
  after(async () => {
    try {
      await resendVerificationEmail(parsed.data.email, baseUrl, ip)
    } catch (err) {
      // The caller has already been answered. This is the only place a repeated
      // failure to send would show, and a member stuck at PENDING with no link
      // is exactly what this endpoint exists to end.
      logger.error('Resend of verification email failed', {
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return apiSuccess({
    message: 'If that account is waiting to be verified, a new link has been sent.',
  })
})
