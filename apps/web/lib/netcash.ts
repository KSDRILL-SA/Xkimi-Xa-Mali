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
  reason?: string
  errorCode?: string
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

class NetcashError extends Error {
  constructor(public readonly statusCode: number, message: string, public readonly errorCode?: string) {
    super(message)
    this.name = 'NetcashError'
  }
}

const NETCASH_TIMEOUT_MS = 30_000

// Dev-only simulator: when no Netcash service key is configured outside of
// production, return plausible success responses so the mandate/debit flow can
// be exercised end-to-end locally. This is NEVER reached in production — there,
// a missing key throws (real DebiCheck registration requires real credentials).
function simulateNetcash<T>(path: string, body: Record<string, unknown>): T {
  const ref = `SIM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const existingId = typeof body.mandateId === 'string' ? body.mandateId : ref

  if (path.includes('/mandate/create')) {
    // New mandates start PENDING — the group admin still approves them to ACTIVE.
    return { mandateId: ref, status: 'PENDING' as const } as unknown as T
  }
  if (path.includes('/mandate/cancel')) {
    return { mandateId: existingId, status: 'CANCELLED' as const } as unknown as T
  }
  if (path.includes('/mandate/update') || path.includes('/mandate/delay')) {
    return { mandateId: existingId, status: 'ACTIVE' as const } as unknown as T
  }
  if (path.includes('/mandate/status')) {
    return { mandateId: existingId, status: 'ACTIVE' as const } as unknown as T
  }
  if (path.includes('/debit/')) {
    return { transactionRef: ref, status: 'SUCCESS' as const } as unknown as T
  }
  return { status: 'SUCCESS' as const } as unknown as T
}

async function netcashPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!env.NETCASH_SERVICE_KEY) {
    if (process.env.NODE_ENV !== 'production') return simulateNetcash<T>(path, body)
    throw new ExternalServiceError('Netcash', 'NETCASH_SERVICE_KEY not configured')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), NETCASH_TIMEOUT_MS)

  try {
    const res = await fetch(`${env.NETCASH_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': env.NETCASH_SERVICE_KEY,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
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
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new NetcashError(408, 'Netcash request timed out', 'TIMEOUT')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
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

/**
 * A Netcash mandate status, or null if we do not recognise it.
 *
 * Null rather than a guess. This used to fall back to SUSPENDED, and the mock
 * fell back to PENDING — two different answers to the same unknown, in code
 * carrying a comment saying the rules were shared on purpose. Either way an
 * unrecognised response moved the mandate out of ACTIVE, and the debit run only
 * collects from ACTIVE mandates: one unfamiliar status code and a member simply
 * stopped being debited, with nothing said to them or to an admin.
 *
 * A status we cannot read is not a status change. Callers leave the mandate
 * alone and say so loudly, exactly as `mapTransactionStatus` already does.
 */
export function mapNetcashStatus(raw: string): 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | null {
  const map: Record<string, 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'> = {
    PENDING: 'PENDING', AUTHORIZED: 'ACTIVE', ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED', REJECTED: 'SUSPENDED', CANCELLED: 'CANCELLED',
  }
  return map[raw.toUpperCase()] ?? null
}

// ─── Webhook security ─────────────────────────────────────────────────────────

// Netcash signs the raw request body with HMAC-SHA256.
// Compares raw HMAC bytes in constant time — accepts hex or base64-encoded signatures.
export function verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean {
  if (!env.NETCASH_WEBHOOK_SECRET) return false
  const expectedBuf = createHmac('sha256', env.NETCASH_WEBHOOK_SECRET).update(rawBody).digest()
  const clean = signatureHeader.trim()
  let receivedBuf: Buffer | null = null
  if (/^[0-9a-f]{64}$/i.test(clean)) {
    receivedBuf = Buffer.from(clean, 'hex')
  } else if (/^[A-Za-z0-9+/]{43,44}={0,2}$/.test(clean)) {
    receivedBuf = Buffer.from(clean, 'base64')
  }
  if (!receivedBuf || receivedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(expectedBuf, receivedBuf)
}

const DEFAULT_WEBHOOK_IPS = [
  '196.10.1.152',
  '196.10.1.153',
  '196.10.3.152',
  '196.10.3.153',
]

let _webhookIpSet: ReadonlySet<string> | null = null

function getWebhookIps(): ReadonlySet<string> {
  if (_webhookIpSet) return _webhookIpSet
  const envIps = process.env.NETCASH_WEBHOOK_IPS
  const ips = envIps
    ? envIps.split(',').map((ip) => ip.trim()).filter(Boolean)
    : DEFAULT_WEBHOOK_IPS
  _webhookIpSet = new Set(ips)
  return _webhookIpSet
}

export function isAllowedNetcashIp(ip: string): boolean {
  return getWebhookIps().has(ip)
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
