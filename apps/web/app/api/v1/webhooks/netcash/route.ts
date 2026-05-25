import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, isAllowedNetcashIp } from '@/lib/netcash'
import { processMandateWebhook } from '@/services/mandate.service'
import type { NetcashWebhookEvent } from '@/lib/netcash'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Primary gate: HMAC-SHA256 over the raw body. This is the authoritative check —
  // it cannot be forged without the shared secret, unlike the IP header below.
  const signature = req.headers.get('x-netcash-signature') ?? ''
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Defence-in-depth: reject IPs outside Netcash's documented range. x-forwarded-for
  // is only trustworthy behind a trusted proxy (Vercel sets it), so this is a
  // secondary filter, never the sole gate.
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  if (!isAllowedNetcashIp(clientIp)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let event: NetcashWebhookEvent
  try {
    event = JSON.parse(rawBody) as NetcashWebhookEvent
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!event.mandateId || !event.status) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    await processMandateWebhook(event)
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    // Transient failure (e.g. DB unavailable). Return 500 so Netcash retries —
    // swallowing with a 200 would permanently drop the status update.
    console.error('[netcash-webhook] processing failed', err)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
