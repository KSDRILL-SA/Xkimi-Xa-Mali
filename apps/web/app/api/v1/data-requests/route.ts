import { NextRequest } from 'next/server'
import { DsrKind } from '@prisma/client'
import { auth } from '@/lib/auth'
import { dataRequestRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withApiHandler } from '@/lib/api-handler'
import { submitDataRequest, DataRequestValidationError } from '@/services/data-request.service'

/**
 * POPIA data subject requests, submitted by the person making them.
 *
 * Deliberately open to people who are not signed in. The person with the
 * strongest claim to have their information deleted is frequently the one who
 * cannot sign in at all — someone who was invited and never joined still has
 * their ID number sitting on that invitation, and a former member has no account
 * left to log into. Requiring a session here would refuse a statutory right to
 * exactly the people the Act most clearly gives it to.
 *
 * Signing in is still worth something: it links the request to the account, so
 * an administrator does not have to work out who the requester is from an email
 * address. That link is taken from the session and never from the request body.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIP(req) ?? 'unknown'
  const { success } = await dataRequestRatelimit.limit(ip)
  if (!success) {
    return apiError(
      'SYS_005',
      'Too many requests from this connection. Please try again shortly, or email the Information Officer.',
      429,
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const b = body as Record<string, unknown>

  if (typeof b.requesterName !== 'string') return apiError('VAL_001', '"requesterName" is required', 400)
  if (typeof b.requesterEmail !== 'string') return apiError('VAL_002', '"requesterEmail" is required', 400)
  if (typeof b.detail !== 'string') return apiError('VAL_003', '"detail" is required', 400)
  // Object.values, not `in`: `in` walks the prototype chain, so `"toString"`
  // would pass as a valid request kind and only be caught deeper in.
  if (typeof b.kind !== 'string' || !Object.values(DsrKind).includes(b.kind as DsrKind)) {
    return apiError('VAL_004', '"kind" must be a recognised request type', 400)
  }

  // Optional: an unauthenticated submission is the point of this route, so a
  // missing session is not an error.
  const session = await auth()

  try {
    const request = await submitDataRequest({
      requesterName: b.requesterName,
      requesterEmail: b.requesterEmail,
      kind: b.kind as DsrKind,
      detail: b.detail,
      subjectId: session?.user?.id ?? null,
    })

    return apiSuccess(
      {
        reference: request.id,
        // Given back so the requester can hold the Foundation to the same date
        // the Foundation is now measured against.
        respondBy: request.dueAt.toISOString().slice(0, 10),
      },
      201,
    )
  } catch (err) {
    if (err instanceof DataRequestValidationError) {
      return apiError('VAL_005', err.message, 400)
    }
    throw err
  }
})
