import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-response'
import { generateFounderGuidePdf } from '@/lib/pdf/founder-guide'
import { isFounder } from '@/services/distinction.service'
import { withApiHandler } from '@/lib/api-handler'

/**
 * The Founder Guide, generated on request, for founders only.
 *
 * ── Why it is rendered rather than stored ───────────────────────────────────
 *
 * Every figure in the document is read from the constants that enforce the rule
 * at the moment the bytes are made. A copy sitting in blob storage would be a
 * copy that can go stale, and a guide that has gone stale about a number is the
 * exact failure this edition exists to end. The cost is one render, which is
 * what the statement route pays for the same reason.
 *
 * ── Why the badge and not the role ──────────────────────────────────────────
 *
 * `isFounder` reads the conferred distinction — the badge an admin grants by
 * hand, capped at FOUNDER_COUNT — rather than the ADMIN role. Those overlap in
 * practice and are not the same thing, and the instruction here is about the
 * badge: an admin who is not a founder does not get the document, and a founder
 * who holds no admin role does.
 *
 * Checked on the server on every request, not inferred from whether the link
 * was rendered. A page that hides a button is a page; this is the door.
 */
export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  if (!(await isFounder(session.user.id))) {
    // Deliberately not 404. Pretending the guide does not exist would be a
    // small lie to a member of a foundation whose whole argument is that it
    // does not tell them small lies. They are told what it is and why not.
    return apiError(
      'SYS_003',
      'The Founder Guide is issued to founding members. Speak to a group admin if you believe you should have it.',
      403,
    )
  }

  const holder = session.user.name ?? 'The Members'
  const buffer = await generateFounderGuidePdf({ holder })

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'attachment; filename="Xkimi-Xa-Mali-Founder-Guide.pdf"',
      'Content-Length':      String(buffer.byteLength),
      // Every copy is personalised with the holder's name, so it is never a
      // shared cache — and it is regenerated so it is never a stale one either.
      'Cache-Control':       'private, no-store',
    },
  })
})
