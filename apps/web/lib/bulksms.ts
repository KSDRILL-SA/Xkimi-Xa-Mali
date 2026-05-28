import { env } from './env'

const BULKSMS_API_URL = 'https://api.bulksms.com/v1'

export type BulkSMSRoutingGroup =
  | 'ECONOMY'
  | 'STANDARD'
  | 'PREMIUM'

export type BulkSMSDeliveryStatus =
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'UNKNOWN'

export type BulkSMSMessage = {
  id: string
  status: { type: BulkSMSDeliveryStatus; id: string }
  creditCost: number
  to: { address: string; type: 'INTERNATIONAL' | 'GROUP' }
  from: string
  body: string
  encoding: 'TEXT' | 'UNICODE' | 'BINARY'
  protocolId: number
  messageClass: number
  numberOfParts: number
  credits: number
  isLongMessage: boolean
  submissionDate: string
  userSuppliedId?: string
  type: 'TEXT' | 'UNICODE' | 'BINARY'
}

export type BulkSMSSendInput = {
  to: string
  body: string
  /** Caller-supplied correlation ID — echoed back on delivery receipts */
  userSuppliedId?: string
  routingGroup?: BulkSMSRoutingGroup
}

export type BulkSMSDeliveryReceipt = {
  id: string
  status: { type: BulkSMSDeliveryStatus; id: string }
  userSuppliedId?: string
  to: { address: string }
  creditCost: number
  submissionDate: string
  statusChangedDate: string
}

class BulkSMSError extends Error {
  constructor(public statusCode: number, public detail: string) {
    super(`BulkSMS error ${statusCode}: ${detail}`)
    this.name = 'BulkSMSError'
  }
}

function authHeader(): string {
  const credentials = Buffer.from(
    `${env.BULKSMS_USERNAME}:${env.BULKSMS_PASSWORD}`,
  ).toString('base64')
  return `Basic ${credentials}`
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>

  let detail = res.statusText
  try {
    const body = (await res.json()) as { type?: string; detail?: string }
    detail = body.detail ?? body.type ?? res.statusText
  } catch {
    // non-JSON error body — use statusText
  }
  throw new BulkSMSError(res.status, detail)
}

export async function sendSMS(input: BulkSMSSendInput): Promise<BulkSMSMessage[]> {
  const res = await fetch(`${BULKSMS_API_URL}/messages`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: input.to,
      body: input.body,
      routingGroup: input.routingGroup ?? 'STANDARD',
      ...(input.userSuppliedId && { userSuppliedId: input.userSuppliedId }),
    }),
  })

  return handleResponse<BulkSMSMessage[]>(res)
}

export async function sendBulkSMS(
  messages: BulkSMSSendInput[],
): Promise<BulkSMSMessage[]> {
  if (messages.length === 0) return []

  const res = await fetch(`${BULKSMS_API_URL}/messages`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      messages.map((m) => ({
        to: m.to,
        body: m.body,
        routingGroup: m.routingGroup ?? 'STANDARD',
        ...(m.userSuppliedId && { userSuppliedId: m.userSuppliedId }),
      })),
    ),
  })

  return handleResponse<BulkSMSMessage[]>(res)
}

export async function getSMSStatus(messageId: string): Promise<BulkSMSMessage> {
  const res = await fetch(`${BULKSMS_API_URL}/messages/${messageId}`, {
    headers: { Authorization: authHeader() },
  })
  return handleResponse<BulkSMSMessage>(res)
}

/** Normalise a SA phone number to E.164 (+27...) for BulkSMS */
export function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('27') && digits.length === 11) return `+${digits}`
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`
  return phone
}
