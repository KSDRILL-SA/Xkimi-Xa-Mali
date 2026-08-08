import { NextRequest, after } from 'next/server'
import { logger } from '@xxm/observability'
import { PasswordResetRequestSchema as Schema } from '@/lib/validation/auth'
import { forgotPasswordRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { apiSuccess, apiError } from '@/lib/api-response'
import { requestPasswordReset } from '@/services/auth.service'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIP(req) ?? 'unknown'

  const { success } = await forgotPasswordRatelimit.limit(ip)
  if (!success) return apiError('SYS_005', 'Too many requests. Please try again later.', 429)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', 'A valid email address is required.', 400)

  // The work happens after the response, not before it.
  //
  // The message was already identical either way, but the *timing* was not: an
  // unregistered address returned the moment the lookup missed, while a
  // registered one waited on two database writes and a call to Resend. That
  // difference is hundreds of milliseconds and trivially measurable, so the
  // careful wording above told an attacker nothing that the clock did not.
  //
  // Deferring the whole thing makes the response depend on nothing that
  // happened — same path, same work, whether or not the address exists.
  const baseUrl = new URL(req.url).origin
  after(async () => {
    try {
      await requestPasswordReset(parsed.data.email, baseUrl, ip)
    } catch (err) {
      // Swallowed for the caller, who has already been answered, but not
      // silently: this is the only place a failure to send a reset would show.
      logger.error('Password reset request failed', {
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  })

  return apiSuccess({ message: 'If that email is registered, a reset link has been sent.' })
})
