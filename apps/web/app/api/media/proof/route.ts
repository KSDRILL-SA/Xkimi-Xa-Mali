import { NextRequest, NextResponse } from 'next/server'
import { get } from '@vercel/blob'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Serves a member their own proof of payment.
 *
 * The admin console has a route like this one, and this is deliberately not it.
 * There, the question is "does any row claim this object" — an admin is
 * entitled to every proof, because reconciling them against the bank statement
 * is the job. Here the question is narrower and has to be: **does a transaction
 * on THIS member's own contribution claim it.**
 *
 * That difference is the whole route. A proof of payment carries a bank account
 * number, a name and often a balance, so the same lookup with the ownership
 * clause left off would turn any signed-in member into a reader of every other
 * member's banking details. The clause is not an optimisation and must not be
 * relaxed into one.
 *
 * ## Why members get to see these at all
 *
 * Leadership records money against a member's name from a document the member
 * themselves sent to the WhatsApp group. Being able to open it is how they
 * confirm the right amount landed on the right month — the commonest real error
 * here is a payment recorded against the wrong period, and the member is the
 * person best placed to notice. Showing the payment but withholding its
 * evidence would ask them to take leadership's word for their own money.
 *
 * ## `data:` references are refused rather than proxied
 *
 * Local development stores objects as self-contained `data:` URLs, which render
 * directly and never reach this route. One arriving here means something
 * upstream is confused, so it is rejected rather than handled.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return new NextResponse('Unauthorised', { status: 401 })

  const ref = new URL(req.url).searchParams.get('ref')
  if (!ref || ref.startsWith('data:') || /^https?:\/\//.test(ref)) {
    return new NextResponse('Missing or invalid reference', { status: 400 })
  }

  // Ownership and existence in one question. Note the path from the object back
  // to the person: a transaction has no userId of its own — it belongs to a
  // contribution, which belongs to the member. Matching any other way would
  // either never find anything or, worse, find everything.
  const owned = await db.transaction.findFirst({
    where: { proofUrl: ref, contribution: { userId } },
    select: { id: true },
  })

  // 404 rather than 403 on someone else's file. A distinct "forbidden" would
  // confirm the object exists, turning this into a way to test guesses about
  // other members' records.
  if (!owned) return new NextResponse('Not found', { status: 404 })

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
      // Opened to be looked at. `filename` is deliberately absent — the stored
      // pathname can carry an id, and a download prompt is not a good place to
      // leak one.
      'Content-Disposition': 'inline',
      // Private to this member's browser, never a shared cache. Without this a
      // proxy could hold the document and hand it to the next person.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
