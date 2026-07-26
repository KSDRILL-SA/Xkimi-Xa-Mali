import { NextRequest, NextResponse } from 'next/server'
import { updateSMSDeliveryStatus } from '@/services/notification.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

// BulkSMS documented IP ranges for delivery receipts. Overridable via
// BULKSMS_WEBHOOK_IPS (comma-separated prefixes) for local/preview testing,
// mirroring the Netcash allowlist — so the check is driven by config, not by a
// NODE_ENV branch (INFRA-I03), and stays enforced in every deployed environment.
const DEFAULT_BULKSMS_IP_RANGES = [
  '196.38.122.',
  '196.38.123.',
  '196.38.124.',
  '196.38.125.',
  '41.72.104.',
  '41.72.105.',
]

const BULKSMS_IP_RANGES =
  process.env.BULKSMS_WEBHOOK_IPS?.split(',').map((p) => p.trim()).filter(Boolean) ??
  DEFAULT_BULKSMS_IP_RANGES

function isAllowedBulkSMSIp(ip: string): boolean {
  return ip !== '' && BULKSMS_IP_RANGES.some((prefix) => ip.startsWith(prefix))
}

type DeliveryReceiptEntry = {
  id?: string
  userSuppliedId?: string
  status?: { type?: string }
}

export const POST = withApiHandler(async (req: NextRequest) => {
  // Through the shared trust model, not the raw header. Signature
  // verification above is the primary control; this allowlist is the second
  // lock, and a second lock a caller can pick themselves is not one.
  const clientIp = getClientIP(req) ?? ''

  // Delivery receipts are authenticated by source IP only (BulkSMS does not sign
  // them). Enforced in every environment — an empty/unknown IP is rejected.
  if (!isAllowedBulkSMSIp(clientIp)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const receipts: DeliveryReceiptEntry[] = Array.isArray(body) ? body : [body]

  await Promise.all(
    receipts.map(async (receipt) => {
      const notificationId = receipt.userSuppliedId
      const deliveryStatus = receipt.status?.type

      if (!notificationId || !deliveryStatus) return

      try {
        await updateSMSDeliveryStatus(notificationId, deliveryStatus)
      } catch {
        // Non-fatal — BulkSMS will not retry based on our response body, only HTTP status.
      }
    }),
  )

  // BulkSMS requires a 200 response regardless of processing outcome.
  return new NextResponse(null, { status: 200 })
}, { rateLimit: false })
