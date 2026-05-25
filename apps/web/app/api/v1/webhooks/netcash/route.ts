import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, isAllowedNetcashIp } from '@/lib/netcash'
import { processMandateWebhook } from '@/services/mandate.service'
import type { NetcashWebhookEvent } from '@/lib/netcash'

export async function POST(req: NextRequest) {
  // IP allowlist check
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  if (!isAllowedNetcashIp(clientIp)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rawBody = await req.text()

  // HMAC-SHA256 signature verification
  const signature = req.headers.get('x-netcash-signature') ?? ''
  if (!signature || !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
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
  } catch {
    // Avoid leaking internal errors to Netcash — log via audit, return 200 to stop retries
    return NextResponse.json({ received: true }, { status: 200 })
  }
}
