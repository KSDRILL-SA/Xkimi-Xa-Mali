import { createHmac, timingSafeEqual } from 'crypto'
import { env } from './env'
import { withRetry } from './retry'
import { ExternalServiceError } from './errors'

const BULKSMS_API_URL = 'https://api.bulksms.com/v1'

export type BulkSMSRoutingGroup = 'ECONOMY' | 'STANDARD' | 'PREMIUM'

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
  constructor(public readonly statusCode: number, detail: string) {
    super(`BulkSMS ${statusCode}: ${detail}`)
    this.name = 'BulkSMSError'
  }
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.BULKSMS_USERNAME}:${env.BULKSMS_PASSWORD}`).toString('base64')}`
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>

  let detail = res.statusText
  try {
    const body = (await res.json()) as { type?: string; detail?: string }
    detail = body.detail ?? body.type ?? res.statusText
  } catch { /* non-JSON body */ }

  throw new BulkSMSError(res.status, detail)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BULKSMS_API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseResponse<T>(res)
}

export async function sendSMS(input: BulkSMSSendInput): Promise<BulkSMSMessage[]> {
  return withRetry(
    () => post<BulkSMSMessage[]>('/messages', {
      to: input.to,
      body: input.body,
      routingGroup: input.routingGroup ?? 'STANDARD',
      ...(input.userSuppliedId && { userSuppliedId: input.userSuppliedId }),
    }),
    { maxAttempts: 3, baseDelayMs: 500, label: `BulkSMS.sendSMS(${input.to})` },
  ).catch((err) => {
    throw new ExternalServiceError('BulkSMS', err instanceof Error ? err.message : undefined)
  })
}

export async function sendBulkSMS(messages: BulkSMSSendInput[]): Promise<BulkSMSMessage[]> {
  if (messages.length === 0) return []

  return withRetry(
    () => post<BulkSMSMessage[]>('/messages', messages.map((m) => ({
      to: m.to,
      body: m.body,
      routingGroup: m.routingGroup ?? 'STANDARD',
      ...(m.userSuppliedId && { userSuppliedId: m.userSuppliedId }),
    }))),
    { maxAttempts: 3, baseDelayMs: 500, label: `BulkSMS.sendBulkSMS(${messages.length} msgs)` },
  ).catch((err) => {
    throw new ExternalServiceError('BulkSMS', err instanceof Error ? err.message : undefined)
  })
}

export async function getSMSStatus(messageId: string): Promise<BulkSMSMessage> {
  const res = await fetch(`${BULKSMS_API_URL}/messages/${messageId}`, {
    headers: { Authorization: authHeader() },
  })
  return parseResponse<BulkSMSMessage>(res)
}

export function verifyBulkSmsWebhook(
  body: string,
  signature: string,
  secret: string,
): boolean {
  // BulkSMS delivery receipts carry a HMAC-SHA256 signature header.
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const exp = Buffer.from(expected, 'utf8')
  const got = Buffer.from(signature, 'utf8')
  return exp.length === got.length && timingSafeEqual(exp, got)
}

/** Normalise a SA phone number to E.164 (+27...) for BulkSMS */
export function normalisePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('27') && d.length === 11) return `+${d}`
  if (d.startsWith('0') && d.length === 10) return `+27${d.slice(1)}`
  return phone
}
