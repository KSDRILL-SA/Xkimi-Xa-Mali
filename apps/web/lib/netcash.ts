import { createHmac, timingSafeEqual } from 'crypto'
import { env } from './env'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetcashAccountType = 'Cheque' | 'Savings' | 'Transmission'

export type NetcashMandateStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'REJECTED'

export type NetcashCreateMandatePayload = {
  accountNumber: string
  branchCode: string
  accountType: NetcashAccountType
  accountName: string
  idNumber?: string
  amount: number
  debitDay: number
  startDate: string // YYYY-MM-DD
  referenceNumber: string
}

export type NetcashMandateResponse = {
  mandateId: string
  status: NetcashMandateStatus
  message?: string
  errorCode?: string
}

export type NetcashStatusResponse = {
  mandateId: string
  status: NetcashMandateStatus
  lastDebitDate?: string
  nextDebitDate?: string
}

export type NetcashWebhookEvent = {
  mandateId: string
  status: NetcashMandateStatus
  reason?: string
  transactionRef?: string
  amount?: number
  processedAt?: string
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

async function netcashPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.NETCASH_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': env.NETCASH_SERVICE_KEY,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as T & { errorCode?: string; message?: string }

  if (!res.ok || json.errorCode) {
    throw new Error(json.message ?? `Netcash error ${res.status}`)
  }

  return json
}

// ─── Mandate operations ───────────────────────────────────────────────────────

export async function createDebiCheckMandate(
  payload: NetcashCreateMandatePayload,
): Promise<NetcashMandateResponse> {
  return netcashPost<NetcashMandateResponse>('/mandate/create', {
    serviceKey: env.NETCASH_SERVICE_KEY,
    ...payload,
  })
}

export async function cancelDebiCheckMandate(mandateId: string): Promise<NetcashMandateResponse> {
  return netcashPost<NetcashMandateResponse>('/mandate/cancel', {
    serviceKey: env.NETCASH_SERVICE_KEY,
    mandateId,
  })
}

// Amend an existing DebiCheck mandate. Both the collection amount and the
// debit day can change; either takes effect from the supplied effectiveDate.
export async function updateDebiCheckMandate(
  mandateId: string,
  changes: { amount?: number; debitDay?: number },
  effectiveDate: string,
): Promise<NetcashMandateResponse> {
  return netcashPost<NetcashMandateResponse>('/mandate/update', {
    serviceKey: env.NETCASH_SERVICE_KEY,
    mandateId,
    ...(changes.amount !== undefined && { amount: changes.amount }),
    ...(changes.debitDay !== undefined && { debitDay: changes.debitDay }),
    effectiveDate,
  })
}

export async function delayMandate(
  mandateId: string,
  newDate: string,
): Promise<NetcashMandateResponse> {
  return netcashPost<NetcashMandateResponse>('/mandate/delay', {
    serviceKey: env.NETCASH_SERVICE_KEY,
    mandateId,
    newDate,
  })
}

export async function getMandateStatus(mandateId: string): Promise<NetcashStatusResponse> {
  return netcashPost<NetcashStatusResponse>('/mandate/status', {
    serviceKey: env.NETCASH_SERVICE_KEY,
    mandateId,
  })
}

// ─── Webhook security ─────────────────────────────────────────────────────────

// Netcash signs the raw request body with HMAC-SHA256 using the webhook secret.
// Compared in constant time to avoid leaking the digest via a timing side-channel.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const expected = createHmac('sha256', env.NETCASH_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')
  const expectedBuf = Buffer.from(expected, 'utf8')
  const providedBuf = Buffer.from(signatureHeader, 'utf8')
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}

// Documented Netcash outbound IP addresses. Reject webhook calls from outside this set.
export const NETCASH_WEBHOOK_IPS: ReadonlySet<string> = new Set([
  '196.10.1.152',
  '196.10.1.153',
  '196.10.3.152',
  '196.10.3.153',
])

export function isAllowedNetcashIp(ip: string): boolean {
  return NETCASH_WEBHOOK_IPS.has(ip)
}

// ─── Status mapping ───────────────────────────────────────────────────────────

export function mapNetcashStatus(
  raw: string,
): 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' {
  const map: Record<string, 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'> = {
    PENDING: 'PENDING',
    AUTHORIZED: 'ACTIVE',
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    REJECTED: 'SUSPENDED',
    CANCELLED: 'CANCELLED',
  }
  return map[raw.toUpperCase()] ?? 'SUSPENDED'
}

// Returns the next calendar occurrence of debitDay as YYYY-MM-DD.
// Built from local calendar components (not toISOString) so the date is correct
// regardless of server timezone — SAST is UTC+2, where toISOString would roll
// a local-midnight date back to the previous day.
export function getNextDebitDate(debitDay: number): string {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth() // 0-indexed
  // If today is the debit day or later, the next debit is next month
  if (now.getDate() >= debitDay) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(debitDay).padStart(2, '0')}`
}
