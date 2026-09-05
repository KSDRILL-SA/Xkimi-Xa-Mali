import { createHmac, timingSafeEqual } from 'crypto'
import { env } from './env'
import { withRetry } from './retry'
import { ExternalServiceError } from './errors'
import { NetcashSoapError } from './netcash/soap'
import { debitAmountWithFee, NETCASH_FEE_BUFFER } from './group-account'
import { sumZAR } from './money'
import {
  debiCheckAuthenticate,
  debiCheckCancel,
  debiCheckAmend,
  debiCheckCurrentStatus,
  batchFileUpload,
  requestFileUploadReport,
  isValidServiceKey,
} from './netcash/methods'
import {
  buildDebiCheckBatchFile,
  toCents,
  DEFAULT_SOFTWARE_VENDOR_KEY,
} from './netcash/batch-file'

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
  /** Required by DebiCheckAuthenticate — the bank contacts the debtor on these. */
  mobileNumber?: string
  emailAddress?: string
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

// ─── Transport ────────────────────────────────────────────────────────────────
//
// The SOAP transport lives in `./netcash/soap`. What stood here was a JSON HTTP
// client, a retry wrapper around it, and a development-only simulator that
// returned plausible successes for REST paths the vendor does not publish.
//
// All three are gone rather than left in place. The simulator is the one worth
// naming: it made a wrong integration look like a working one on every
// developer machine, which is a large part of why the mismatch survived this
// long. Local development uses the mock gateway — selected explicitly by
// `PAYMENT_GATEWAY=mock`, and refused on a live deployment — so there is one
// stand-in rather than two, and choosing it is a decision somebody makes rather
// than a silent fallback.

// ─── Mandate operations ───────────────────────────────────────────────────────
//
// Each of these is now a real NIWS_NIF SOAP call. What was here before issued
// JSON POSTs to paths that do not exist (`/mandate/create`, `/debit/once-off`)
// with the service key in a header rather than as a method parameter — so none
// of it could ever have worked against the live service.

/** The service key, or a refusal that names what is missing. */
function requireServiceKey(): string {
  if (!env.NETCASH_SERVICE_KEY) {
    throw new ExternalServiceError('Netcash', 'NETCASH_SERVICE_KEY is not configured')
  }
  return env.NETCASH_SERVICE_KEY
}

function softwareVendorKey(): string {
  return process.env.NETCASH_SOFTWARE_VENDOR_KEY || DEFAULT_SOFTWARE_VENDOR_KEY
}

function mandateTemplateId(): string {
  const id = process.env.NETCASH_DEBICHECK_TEMPLATE_ID
  if (!id) {
    throw new ExternalServiceError(
      'Netcash',
      'NETCASH_DEBICHECK_TEMPLATE_ID is not configured — a DebiCheck mandate cannot be authenticated without a template',
    )
  }
  return id
}

/**
 * Retry only what is worth retrying.
 *
 * A configuration refusal — wrong key, inactive merchant, wrong template — will
 * fail identically three times and only delays the moment a human finds out.
 * A timeout or a transport error is worth another attempt.
 */
function callWithRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return withRetry(fn, {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    label: `Netcash.${label}`,
    retryIf: (err) =>
      !(
        err instanceof NetcashSoapError &&
        err.httpStatus !== undefined &&
        err.httpStatus >= 400 &&
        err.httpStatus < 500
      ),
  }).catch((err) => {
    if (err instanceof NetcashSoapError) throw new ExternalServiceError('Netcash', err.message)
    throw err
  })
}

/** CCYYMMDD from a YYYY-MM-DD string. */
function toNetcashDate(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '')
}

/**
 * What the mandate must register, given what the member agreed to contribute.
 *
 * ── The defect this exists for ─────────────────────────────────────────────
 *
 * Every collection submits `contribution + fee` — `debitAmountWithFee` — while
 * the mandate registered the bare contribution as BOTH the collection amount
 * and the maximum. Appendix A §10.6.3 makes a Dispute Request qualify as a
 * Dispute Action when
 *
 *     the amount collected ... is greater than the Instalment Amount in the
 *     Mandate Register
 *
 * so every single collection qualified. Not "could be argued" — qualified, by
 * the contract's own wording, against the 0.5% dispute threshold in §16.1. At
 * fifty members that threshold is a quarter of one collection, so one member
 * noticing is a fourfold breach, and §16.5 then forbids moving to another
 * provider until remediated.
 *
 * ── Why the same function as the collection ────────────────────────────────
 *
 * Registered here and collected in four other places. If the two are computed
 * separately they will disagree eventually — that is exactly how this happened,
 * and how four different collection references came to exist. `registeredAmount`
 * calls `debitAmountWithFee`, the same function every collection path calls, so
 * "what we told the bank" and "what we ask for" cannot drift apart.
 *
 * ── The maximum, and why it is not simply the same number ──────────────────
 *
 * C3 §3.10 permits a Maximum Amount of up to 1.5x the Instalment. Setting the
 * two equal, as this did, throws away the field that exists for precisely this
 * case and leaves no room at all.
 *
 * The headroom is one further fee, not a percentage: the fee buffer is an
 * environment variable, and if it is ever raised, every existing mandate would
 * otherwise under-register and have to be re-authenticated by every member.
 * Deliberately modest — a member authenticating this at their bank sees the
 * ceiling, and "up to R470" against a R450 contribution is explicable in a way
 * that 1.5x would not be.
 */
function registeredAmount(contributionAmount: number): number {
  return debitAmountWithFee(contributionAmount)
}

function registeredMaximum(contributionAmount: number): number {
  return sumZAR(registeredAmount(contributionAmount), NETCASH_FEE_BUFFER)
}

export async function createDebiCheckMandate(
  payload: NetcashCreateMandatePayload,
): Promise<NetcashMandateResponse> {
  const serviceKey = requireServiceKey()

  const result = await callWithRetry('createMandate', () =>
    debiCheckAuthenticate({
      serviceKey,
      accountReference: payload.referenceNumber,
      mandateTemplateId: mandateTemplateId(),
      // A South African ID is 13 digits; anything else is a passport or business
      // registration number, which is what IsIdNumber = 0 means.
      isIdNumber: !!payload.idNumber && /^\d{13}$/.test(payload.idNumber),
      debtorIdentification: payload.idNumber ?? '',
      accountName: payload.accountName,
      bankAccountName: payload.accountName,
      branchCode: payload.branchCode,
      bankAccountNumber: payload.accountNumber,
      bankAccountType: payload.accountType,
      mobileNumber: payload.mobileNumber ?? '',
      emailAddress: payload.emailAddress ?? '',
      collectionAmount: registeredAmount(payload.amount),
      firstCollectionDiffers: false,
      firstCollectionAmount: registeredAmount(payload.amount),
      firstCollectionDate: toNetcashDate(payload.startDate),
      collectionDayCode: String(payload.debitDay).padStart(2, '0'),
    }),
  )

  // The bank answers inside this call. "Accepted" is an authorised mandate;
  // anything else is a refusal, and recording it as pending would leave a
  // member waiting on an authorisation that is never coming.
  const authorised = result.ok && /accepted/i.test(result.status ?? '')

  return {
    mandateId: result.contractReference ?? '',
    status: authorised ? 'AUTHORIZED' : 'REJECTED',
    message: result.message,
    errorCode: result.code || undefined,
  }
}

/** Netcash's cancellation reason for a mandate the payer no longer wants. */
const CANCEL_REASON_AT_PAYER_REQUEST = '01'

export async function cancelDebiCheckMandate(mandateId: string): Promise<NetcashMandateResponse> {
  const serviceKey = requireServiceKey()
  const result = await callWithRetry('cancelMandate', () =>
    debiCheckCancel({
      serviceKey,
      contractReference: mandateId,
      reasonCode: CANCEL_REASON_AT_PAYER_REQUEST,
    }),
  )

  return {
    mandateId,
    status: result.ok ? 'CANCELLED' : 'ACTIVE',
    message: result.message,
    errorCode: result.code || undefined,
  }
}

export async function updateDebiCheckMandate(
  mandateId: string,
  changes: { amount?: number; debitDay?: number },
  _effectiveDate: string,
): Promise<NetcashMandateResponse> {
  const serviceKey = requireServiceKey()

  // Only the amount can be amended without re-authenticating the debtor. A
  // changed collection day is a new mandate as far as the bank is concerned, and
  // reporting success here would claim something that did not happen.
  if (changes.amount === undefined) {
    throw new ExternalServiceError(
      'Netcash',
      'Only the collection amount can be amended on an authorised DebiCheck mandate',
    )
  }

  // Captured after the guard above, which has already refused an undefined
  // amount — the narrowing does not survive into the closure below.
  const amount = changes.amount

  const result = await callWithRetry('updateMandate', () =>
    debiCheckAmend({
      serviceKey,
      contractReference: mandateId,
      collectionAmountCents: toCents(registeredAmount(amount)),
      maximumCollectionAmountCents: toCents(registeredMaximum(amount)),
    }),
  )

  return {
    mandateId,
    status: result.ok ? 'ACTIVE' : 'SUSPENDED',
    message: result.message,
    errorCode: result.code || undefined,
  }
}

export async function delayMandate(
  _mandateId: string,
  _newDate: string,
): Promise<NetcashMandateResponse> {
  // DebiCheck has no "move this month's collection" operation. A delay is
  // expressed by when the collection batch is submitted, not by amending the
  // mandate — so this says so rather than calling something that would change
  // the mandate itself and report a success the bank never gave.
  throw new ExternalServiceError(
    'Netcash',
    'DebiCheck mandates cannot be delayed at the gateway — submit the collection batch on the later action date instead',
  )
}

export async function getMandateStatus(mandateId: string): Promise<NetcashStatusResponse> {
  const serviceKey = requireServiceKey()
  const result = await callWithRetry('getMandateStatus', () =>
    debiCheckCurrentStatus({ serviceKey, contractReference: mandateId }),
  )

  return {
    mandateId,
    // Left exactly as the gateway said it. mapNetcashStatus decides what an
    // unfamiliar value means, and it deliberately answers "I do not know"
    // rather than guessing a status that would stop a member being collected.
    status: (result.status ?? 'PENDING') as NetcashMandateStatus,
  }
}

/**
 * Submit a single collection.
 *
 * A DebiCheck collection is a batch upload even for one transaction — there is
 * no per-transaction endpoint. The response is a **file token**, not a
 * settlement: the money has not moved and the bank has not answered. PENDING is
 * the only honest status here; the outcome arrives later through the load report
 * or the webhook.
 */
async function submitDebit(
  payload: { mandateId: string; amount: number; reference: string; idempotencyKey: string },
  label: string,
  actionDate: Date,
): Promise<NetcashDebitResponse> {
  const serviceKey = requireServiceKey()

  const { file } = buildDebiCheckBatchFile({
    serviceKey,
    batchName: payload.idempotencyKey.slice(0, 30),
    actionDate,
    softwareVendorKey: softwareVendorKey(),
    rows: [
      {
        accountReference: payload.reference,
        mandateReference: payload.mandateId,
        amountRands: payload.amount,
      },
    ],
  })

  const result = await callWithRetry(label, () => batchFileUpload({ serviceKey, file }))

  if (!result.ok) {
    return {
      status: 'FAILED',
      message: result.message,
      reason: result.message,
      errorCode: result.code || undefined,
    }
  }

  return {
    transactionRef: result.fileToken ?? undefined,
    status: 'PENDING',
    message: result.message,
  }
}

export async function submitOnceOffDebit(payload: {
  mandateId: string
  amount: number
  reference: string
  idempotencyKey: string
}): Promise<NetcashDebitResponse> {
  return submitDebit(payload, 'submitOnceOffDebit', new Date())
}

export async function submitScheduledDebit(payload: {
  mandateId: string
  amount: number
  reference: string
  idempotencyKey: string
}): Promise<NetcashDebitResponse> {
  return submitDebit(payload, 'submitScheduledDebit', new Date())
}

/**
 * Is the configured service key live and authorised for debit orders?
 *
 * Read-only and cheap. Worth calling before a debit run: an expired or
 * unauthorised key otherwise presents as every member's payment being declined
 * at the same moment.
 */
export async function checkServiceKey(): Promise<{ ok: boolean; message: string }> {
  const serviceKey = requireServiceKey()
  const result = await isValidServiceKey({
    serviceKey,
    softwareVendorCode: softwareVendorKey(),
  })
  return { ok: result.ok, message: result.message }
}

/** The outcome of a submitted batch. Null while it is still being processed. */
export async function fetchBatchReport(fileToken: string): Promise<string | null> {
  const serviceKey = requireServiceKey()
  const result = await requestFileUploadReport({ serviceKey, fileToken })
  return result.ready ? result.report : null
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
