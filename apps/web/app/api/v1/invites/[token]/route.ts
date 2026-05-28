import { apiSuccess, apiError } from '@/lib/api-response'
import {
  validateInviteToken,
  InviteNotFoundError, InviteExpiredError, InviteAlreadyAcceptedError,
} from '@/services/invite.service'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  try {
    const result = await validateInviteToken(token)
    return apiSuccess(result)
  } catch (e) {
    if (e instanceof InviteNotFoundError)        return apiError(e.code, e.message, 404)
    if (e instanceof InviteExpiredError)         return apiError(e.code, e.message, 410)
    if (e instanceof InviteAlreadyAcceptedError) return apiError(e.code, e.message, 409)
    throw e
  }
}
