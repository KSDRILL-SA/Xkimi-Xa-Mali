import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature, isAllowedNetcashIp } from '@/lib/netcash'
import { processMandateWebhook } from '@/services/mandate.service'
import { processTransactionWebhook } from '@/services/contribution.service'
import { logger } from '@/lib/logger'

// Raw webhook payload — Netcash may send mandate events, transaction events, or both.
type WebhookPayload = {
  mandateId?: string
  transactionRef?: string
  status: string
  reason?: string
  amount?: number
  processedAt?: string
}

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

  let payload: WebhookPayload
  try {
    payload = JSON.parse(rawBody) as WebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload.status) {
    return NextResponse.json({ error: 'Missing status field' }, { status: 400 })
  }

  try {
    // Dispatch by payload shape — events may carry mandate, transaction, or both.
    const jobs: Promise<void>[] = []

    if (payload.mandateId) {
      jobs.push(
        processMandateWebhook({
          mandateId: payload.mandateId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: payload.status as any,
          reason: payload.reason,
          transactionRef: payload.transactionRef,
          amount: payload.amount,
          processedAt: payload.processedAt,
        }),
      )
    }

    if (payload.transactionRef) {
      jobs.push(
        processTransactionWebhook({
          transactionRef: payload.transactionRef,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          status: payload.status as any,
          mandateId: payload.mandateId,
          amount: payload.amount,
          reason: payload.reason,
          processedAt: payload.processedAt,
        }),
      )
    }

    if (jobs.length === 0) {
      return NextResponse.json({ error: 'Missing mandateId or transactionRef' }, { status: 400 })
    }

    await Promise.all(jobs)
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    // Transient failure. Return 500 so Netcash retries — a 200 would permanently drop it.
    logger.error('Netcash webhook processing failed', { err })
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
