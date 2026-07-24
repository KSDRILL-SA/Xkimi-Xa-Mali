import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { paymentGateway } from '@/integrations/payment'
import { processMandateWebhook } from '@/services/mandate.service'
import { processTransactionWebhook } from '@/services/contribution.service'
import { claimWebhookEvent, releaseWebhookEvent, webhookEventKey } from '@/services/webhook-dedupe.service'
import { logger } from '@/lib/logger'
import { withApiHandler } from '@/lib/api-handler'

const MANDATE_STATUSES = [
  'PENDING', 'AUTHORIZED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'REJECTED',
] as const

const TRANSACTION_STATUSES = [
  'SUCCESS', 'FAILED', 'REVERSED', 'PENDING', 'PAID', 'COMPLETED',
  'REJECTED', 'BOUNCED', 'REFUNDED',
] as const

const ALL_STATUSES = [...new Set([...MANDATE_STATUSES, ...TRANSACTION_STATUSES])] as const

const WebhookPayloadSchema = z.object({
  mandateId: z.string().min(1).optional(),
  transactionRef: z.string().min(1).optional(),
  status: z.enum(ALL_STATUSES as unknown as [string, ...string[]]),
  reason: z.string().max(500).optional(),
  amount: z.number().positive().optional(),
  processedAt: z.string().optional(),
}).refine(
  (d) => d.mandateId || d.transactionRef,
  { message: 'Either mandateId or transactionRef is required' },
)

export const POST = withApiHandler(async (req: NextRequest) => {
  const rawBody = await req.text()

  const signature = req.headers.get('x-netcash-signature') ?? ''
  if (!signature || !paymentGateway.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Webhook signature verification failed')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  if (!paymentGateway.isAllowedWebhookIp(clientIp)) {
    logger.warn('Webhook from disallowed IP', { clientIp })
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rawJson: unknown
  try {
    rawJson = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = WebhookPayloadSchema.safeParse(rawJson)
  if (!parsed.success) {
    logger.warn('Webhook payload validation failed', { errors: parsed.error.issues })
    return NextResponse.json(
      { error: 'Invalid payload', details: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    )
  }

  const payload = parsed.data

  // Idempotency: claim this exact (signed, validated) event. A redelivery is
  // acknowledged but never reprocessed — no double-credits.
  const eventKey = webhookEventKey(rawBody)
  const isFirstDelivery = await claimWebhookEvent('netcash', eventKey)
  if (!isFirstDelivery) {
    logger.info('Duplicate Netcash webhook ignored', { eventKey })
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }

  try {
    const jobs: Promise<void>[] = []

    if (payload.mandateId) {
      jobs.push(
        processMandateWebhook({
          mandateId: payload.mandateId,
          status: payload.status as Parameters<typeof processMandateWebhook>[0]['status'],
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
          status: payload.status as Parameters<typeof processTransactionWebhook>[0]['status'],
          mandateId: payload.mandateId,
          amount: payload.amount,
          reason: payload.reason,
          processedAt: payload.processedAt,
        }),
      )
    }

    await Promise.all(jobs)
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    // Processing failed — release the claim so a redelivery can retry it.
    await releaseWebhookEvent('netcash', eventKey)
    throw err
  }
}, { rateLimit: false })
