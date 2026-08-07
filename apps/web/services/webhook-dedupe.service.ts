import { createHash } from 'crypto'
import { db } from '@/lib/db'

/** Stable idempotency key for a raw webhook body. */
export function webhookEventKey(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex')
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}

/**
 * Atomically claim a webhook event for processing.
 * - `true`  → first time we've seen it; the caller should process it.
 * - `false` → a redelivery; the caller should ack (200) without reprocessing.
 *
 * The unique (source, eventKey) constraint makes the claim race-safe even under
 * concurrent redelivery.
 */
export async function claimWebhookEvent(source: string, eventKey: string): Promise<boolean> {
  try {
    await db.processedWebhookEvent.create({ data: { source, eventKey } })
    return true
  } catch (e) {
    if (isUniqueViolation(e)) return false
    throw e
  }
}

/**
 * Release a previously-claimed event so a genuine retry (after a processing
 * failure) can be reprocessed when the provider redelivers.
 */
export async function releaseWebhookEvent(source: string, eventKey: string): Promise<void> {
  await db.processedWebhookEvent.deleteMany({ where: { source, eventKey } })
}
