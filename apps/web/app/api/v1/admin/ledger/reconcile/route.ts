import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { adminBulkRatelimit } from '@/lib/redis'
import { reconcileLedger, getPoolBalance } from '@/services/ledger.service'
import { withApiHandler } from '@/lib/api-handler'
import { isValidInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { writeAuditLog } from '@/services/audit.service'
import { getClientIP } from '@/lib/request'

/**
 * Rebuild any missing pool-ledger entries, on request.
 *
 * ── Why this needed a button ───────────────────────────────────────────────
 *
 * `reconcileLedger` runs nightly at 05:00 SAST and there was no other way to
 * reach it. That is fine while nothing is wrong and useless the moment
 * something is: after a ledger post fails — every one of them is best-effort,
 * so that the failure cannot unwind a payment already recorded — the fund
 * figures members see are short until the small hours, and leadership has no
 * way to close the gap or to check that it closed.
 *
 * The nightly pass remains the backstop. This is the same work, on demand.
 *
 * ── Why it is safe to press ────────────────────────────────────────────────
 *
 * It writes only entries that are missing. Every post is keyed on
 * `(refType, refId, direction)` behind a unique constraint and inserted with
 * `skipDuplicates`, so a second press writes nothing and reports zero. It
 * cannot invent money: it derives entirely from settled transactions and
 * settled goal payments, which are the source of truth it is reconciling
 * against.
 *
 * ── Why the bulk bucket ────────────────────────────────────────────────────
 *
 * It reads every settled payment in the system's history. That is the same
 * shape of work as generating a month's contributions or recalculating every
 * badge, so it shares their limiter rather than getting a laxer one of its own.
 */
export const POST = withApiHandler(async (req: NextRequest) => {
  const isTrustedInternal = isValidInternalRequest(req)

  const session = await auth()
  const sessionRoles = (session?.user?.roles as string[] | undefined) ?? []

  let adminId: string

  if (isTrustedInternal) {
    const forwarded = await resolveInternalAdmin(req)
    if (!forwarded) {
      return apiError('VAL_004', 'A trusted reconciliation must name a current admin', 400)
    }
    adminId = forwarded
  } else {
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)
    if (!sessionRoles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)
    adminId = session.user.id
  }

  const { success } = await adminBulkRatelimit.limit(adminId)
  if (!success) return apiError('SYS_005', 'Rate limit exceeded. Please try again shortly.', 429)

  const { creditsPosted, debitsPosted } = await reconcileLedger()
  // Read after, not before: the number leadership wants to see is what the
  // pool holds now that the gaps are filled.
  const { balance, entries } = await getPoolBalance()

  // Recorded because it writes to the immutable ledger. Nothing here can move
  // money, but "who asked, when, and what it found" is what makes a balance
  // checkable rather than merely asserted.
  await writeAuditLog({
    userId: adminId,
    action: 'LEDGER_RECONCILIATION_REQUESTED',
    entity: 'LedgerEntry',
    entityId: 'pool',
    payload: { creditsPosted, debitsPosted, balance, entries },
    // The forwarded address, not the socket's. On a server-to-server hop the
    // socket belongs to the admin app itself, so `getClientIP` alone would
    // record our own infrastructure as the actor for every reconciliation.
    ipAddress: (isTrustedInternal ? req.headers.get('x-admin-ip') : null) ?? getClientIP(req),
  })

  return apiSuccess({ creditsPosted, debitsPosted, balance, entries }, 200)
})
