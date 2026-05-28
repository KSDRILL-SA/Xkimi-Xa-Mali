import { NextRequest, NextResponse } from 'next/server'
import { updateSMSDeliveryStatus } from '@/services/notification.service'

// BulkSMS documented IP ranges for delivery receipts (https://www.bulksms.com/developer/json/v1/#tag/Message/operation/listMessages)
const BULKSMS_IP_RANGES = [
  '196.38.122.',
  '196.38.123.',
  '196.38.124.',
  '196.38.125.',
  '41.72.104.',
  '41.72.105.',
]

function isAllowedBulkSMSIp(ip: string): boolean {
  return BULKSMS_IP_RANGES.some((prefix) => ip.startsWith(prefix))
}

type DeliveryReceiptEntry = {
  id?: string
  userSuppliedId?: string
  status?: { type?: string }
}

export async function POST(req: NextRequest) {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''

  if (process.env.NODE_ENV === 'production' && !isAllowedBulkSMSIp(clientIp)) {
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
        // Log in prod observability tooling via Sentry/Vercel.
      }
    }),
  )

  // BulkSMS requires a 200 response regardless of processing outcome.
  return new NextResponse(null, { status: 200 })
}
