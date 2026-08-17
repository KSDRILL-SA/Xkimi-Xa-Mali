import { NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Serves the two kinds of private object this console renders: an admin's
 * signature, and a Goal outcome's proof.
 *
 * Both used to be stored with `access: 'public'`, so the browser could load them
 * straight from a blob URL and no route like this was needed. That was the
 * defect. A signature sat at a path derivable from an admin's id —
 * `signatures/<adminId>/<timestamp>.png` with no random suffix — permanently,
 * without authentication. A proof is a receipt for money the collective spent.
 *
 * ## Why the reference is checked against the database
 *
 * The obvious version of this route takes a pathname and streams it. That turns
 * an admin session into a way to read *anything* in the blob store, including
 * objects belonging to features that have nothing to do with the console, and
 * including anything a later feature happens to put there.
 *
 * So the pathname is not trusted. It has to already be recorded against a row —
 * an `AdminSignature.signatureUrl` or a `Goal.outcomeProofUrl`. If no row claims
 * it, there is nothing here to serve, whoever is asking. That keeps the set of
 * readable objects equal to the set the console legitimately displays, and it
 * stays correct on its own as the store grows.
 *
 * ## `data:` references are refused rather than proxied
 *
 * Local development stores objects as self-contained `data:` URLs. Those render
 * directly in the browser and never reach this route. Passing one here would
 * mean something upstream is confused, so it is rejected rather than handled.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  const roles = (session?.user?.roles as string[] | undefined) ?? []
  if (!session?.user?.id || !roles.includes('ADMIN')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const ref = new URL(req.url).searchParams.get('ref')
  if (!ref || ref.startsWith('data:') || /^https?:\/\//.test(ref)) {
    return new NextResponse('Missing or invalid reference', { status: 400 })
  }

  // The authorisation check. Not "is this a plausible path" — "is this an object
  // the console is entitled to show at all".
  const [signature, goal] = await Promise.all([
    db.adminSignature.findFirst({ where: { signatureUrl: ref }, select: { id: true } }),
    db.goal.findFirst({ where: { outcomeProofUrl: ref }, select: { id: true } }),
  ])

  if (!signature && !goal) {
    return new NextResponse('Not found', { status: 404 })
  }

  let result: Awaited<ReturnType<typeof get>>
  try {
    result = await get(ref, { access: 'private' })
  } catch {
    return new NextResponse('Could not read the file', { status: 502 })
  }

  // `get` resolves to null when the object is gone, and to a 304 variant with a
  // null stream on a conditional request. Neither is bytes.
  if (!result || result.statusCode !== 200) {
    return new NextResponse('Not found', { status: 404 })
  }

  return new NextResponse(result.stream as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': result.blob.contentType ?? 'application/octet-stream',
      // Rendered inline: a signature is an <img> and a proof is opened to be
      // looked at. `filename` is deliberately absent — the stored pathname can
      // carry an id, and a download prompt is not a good place to leak one.
      'Content-Disposition': 'inline',
      // Private to this admin's browser, never to a shared cache. Without this
      // a proxy could hold the object and hand it to the next person.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
