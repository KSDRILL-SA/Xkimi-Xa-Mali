import { createHmac, timingSafeEqual } from 'crypto'
import { env } from './env'
import { withRetry } from './retry'
import { ExternalServiceError } from './errors'

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
  startDate: string
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

export type NetcashTransactionEvent = {
  transactionRef: string
  status: 'SUCCESS' | 'FAILED' | 'REVERSED' | 'PENDING'
  mandateId?: string
  amount?: number
  reason?: string
  processedAt?: string
}

export type NetcashDebitResponse = {
  transactionRef?: string
  status: 'SUCCESS' | 'PENDING' | 'FAILED'
  message?: string
  errorCode?: string
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

class NetcashError extends Error {
  constructor(public readonly statusCode: number, message: string, public readonly errorCode?: string) {
    super(message)
    this.name = 'NetcashError'
  }
}

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
    throw new NetcashError(
      res.status,
      json.message ?? `Netcash HTTP ${res.status}`,
      json.errorCode,
    )
  }

  return json
}

// Retry wrapper: retries on network errors and 5xx, not on 4xx (bad request).
function netcashCall<T>(path: string, body: Record<string, unknown>, label: string): Promise<T> {
  return withRetry(
    () => netcashPost<T>(path, body),
    {
      maxAttempts: 3,
      baseDelayMs: 1_000,
      maxDelayMs: 10_000,
      label: `Netcash.${label}`,
      retryIf: (err) => {
        if (err instanceof NetcashError && err.statusCode >= 400 && err.statusCode < 500) return false
        return true
      },
    },
  ).catch((err) => {
    const detail = err instanceof NetcashError ? err.message : undefined
    throw new ExternalServiceError('Netcash', detail)
  })
}

// ─── Mandate operations ───────────────────────────────────────────────────────

export async function createDebiCheckMandate(
  payload: NetcashCreateMandatePayload,
): Promise<NetcashMandateResponse> {
  return netcashCall('/mandate/create', { serviceKey: env.NETCASH_SERVICE_KEY, ...payload }, 'createMandate')
}

export async function cancelDebiCheckMandate(mandateId: string): Promise<NetcashMandateResponse> {
  return netcashCall('/mandate/cancel', { serviceKey: env.NETCASH_SERVICE_KEY, mandateId }, 'cancelMandate')
}

export async function updateDebiCheckMandate(
  mandateId: string,
  changes: { amount?: number; debitDay?: number },
  effectiveDate: string,
): Promise<NetcashMandateResponse> {
  return netcashCall(
    '/mandate/update',
    {
      serviceKey: env.NETCASH_SERVICE_KEY,
      mandateId,
      ...(changes.amount !== undefined && { amount: changes.amount }),
      ...(changes.debitDay !== undefined && { debitDay: changes.debitDay }),
      effectiveDate,
    },
    'updateMandate',
  )
}

export async function delayMandate(mandateId: string, newDate: string): Promise<NetcashMandateResponse> {
  return netcashCall('/mandate/delay', { serviceKey: env.NETCASH_SERVICE_KEY, mandateId, newDate }, 'delayMandate')
}

export async function getMandateStatus(mandateId: string): Promise<NetcashStatusResponse> {
  return netcashCall('/mandate/status', { serviceKey: env.NETCASH_SERVICE_KEY, mandateId }, 'getMandateStatus')
}

export async function submitOnceOffDebit(payload: {
  mandateId: string
  amount: number
  reference: string
  idempotencyKey: string
}): Promise<NetcashDebitResponse> {
  return netcashCall('/debit/once-off', { serviceKey: env.NETCASH_SERVICE_KEY, ...payload }, 'submitOnceOffDebit')
}

export async function submitScheduledDebit(payload: {
  mandateId: string
  amount: number
  reference: string
  idempotencyKey: string
}): Promise<NetcashDebitResponse> {
  return netcashCall('/debit/scheduled', { serviceKey: env.NETCASH_SERVICE_KEY, ...payload }, 'submitScheduledDebit')
}

// ─── Status mapping ───────────────────────────────────────────────────────────

export function mapNetcashTransactionStatus(raw: string): 'SUCCESS' | 'FAILED' | 'REVERSED' | null {
  const map: Record<string, 'SUCCESS' | 'FAILED' | 'REVERSED'> = {
    SUCCESS: 'SUCCESS', PAID: 'SUCCESS', COMPLETED: 'SUCCESS',
    FAILED: 'FAILED', REJECTED: 'FAILED', BOUNCED: 'FAILED',
    REVERSED: 'REVERSED', REFUNDED: 'REVERSED',
  }
  return map[raw.toUpperCase()] ?? null
}

export function mapNetcashStatus(raw: string): 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' {
  const map: Record<string, 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'> = {
    PENDING: 'PENDING', AUTHORIZED: 'ACTIVE', ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED', REJECTED: 'SUSPENDED', CANCELLED: 'CANCELLED',
  }
  return map[raw.toUpperCase()] ?? 'SUSPENDED'
}

// ─── Webhook security ─────────────────────────────────────────────────────────

// Netcash signs the raw request body with HMAC-SHA256.
// Compared in constant time to prevent timing side-channel attacks.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  const expected = createHmac('sha256', env.NETCASH_WEBHOOK_SECRET).update(rawBody).digest('hex')
  const expBuf = Buffer.from(expected, 'utf8')
  const gotBuf = Buffer.from(signatureHeader, 'utf8')
  if (expBuf.length !== gotBuf.length) return false
  return timingSafeEqual(expBuf, gotBuf)
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

// ─── Date helpers ─────────────────────────────────────────────────────────────

// Returns the next calendar occurrence of debitDay as YYYY-MM-DD.
// Uses local calendar components — NOT toISOString — so the date is correct
// regardless of server TZ (SAST = UTC+2, where toISOString rolls midnight back).
export function getNextDebitDate(debitDay: number): string {
  const now = new Date()
  let year = now.getFullYear()
  let month = now.getMonth()
  if (now.getDate() >= debitDay) {
    month += 1
    if (month > 11) { month = 0; year += 1 }
  }
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(debitDay).padStart(2, '0')}`
}
