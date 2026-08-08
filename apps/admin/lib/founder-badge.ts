import { internalAdminRequest } from '@/lib/api'
import { assertAdmin, AdminNotFoundError, AdminConflictError } from '@/lib/services/shared'

/**
 * The console's half of the Founder badge.
 *
 * The rules live once, in the member app — the cap of four, the audit entry, the
 * notification to the member — and this reaches across to them rather than
 * keeping a second copy. That is the decision recorded for reversals (#283) and
 * it holds for the same reason: two implementations of a rule are two rules, and
 * the one nobody is looking at is the one that drifts.
 *
 * Deliberately **not** in `lib/services`. Everything there is backed by this
 * app's own database client and is enumerated by the authorization test that
 * walks that module's exports. This touches no table — it is an HTTP client —
 * and putting it there would also drag the validated env into every consumer of
 * the member service, which is how it announced itself the first time.
 */
export async function setFounderBadge(
  adminId: string,
  adminRoles: string[],
  memberId: string,
  grant: boolean,
  opts: { note?: string; reason?: string; ip?: string } = {},
) {
  // Belt and braces. `requireAdmin` in the server action has already run this
  // check and the member app runs its own; neither is a reason to skip it here.
  assertAdmin(adminRoles)

  const result = grant
    ? await internalAdminRequest('POST', '/api/v1/admin/distinctions', {
        userId: memberId,
        kind: 'FOUNDER',
        note: opts.note,
      }, { adminUserId: adminId, adminIp: opts.ip })
    : await internalAdminRequest('DELETE', '/api/v1/admin/distinctions', {
        userId: memberId,
        kind: 'FOUNDER',
        reason: opts.reason,
      }, { adminUserId: adminId, adminIp: opts.ip })

  if (!result.ok) {
    // The cap and the double-grant guard both come back as conflicts, and their
    // messages are written to be read by a person standing in the console.
    // Replacing them with something generic would leave that person with a
    // failure and no idea which rule they hit.
    const message = result.error?.message ?? 'The member app could not be reached'
    if (result.status === 409) throw new AdminConflictError(message)
    throw new AdminNotFoundError(message)
  }

  return result.data
}
