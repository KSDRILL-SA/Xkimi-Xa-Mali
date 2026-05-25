import { createHmac } from 'crypto'
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

export async function updateMandateAmount(
  mandateId: string,
  amount: number,
  effectiveDate: string,
): Promise<NetcashMandateResponse> {
  return netcashPost<NetcashMandateResponse>('/mandate/update', {
    serviceKey: env.NETCASH_SERVICE_KEY,
    mandateId,
    amount,
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
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const expected = createHmac('sha256', env.NETCASH_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex')
  return expected === signatureHeader
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

// Returns the next calendar occurrence of debitDay as YYYY-MM-DD
export function getNextDebitDate(debitDay: number): string {
  const now = new Date()
  const candidate = new Date(now.getFullYear(), now.getMonth(), debitDay)
  // If this month's debit day has already passed, roll to next month
  const target = candidate > now ? candidate : new Date(now.getFullYear(), now.getMonth() + 1, debitDay)
  return target.toISOString().slice(0, 10)
}
