/**
 * The Netcash NIF batch file, for DebiCheck collections.
 *
 * Collections do not go through a per-transaction API call. They go through
 * `BatchFileUpload`, which takes a delimited file of records, and the outcome
 * is fetched afterwards with `RequestFileUploadReport`. The adapter this
 * replaces had no concept of a batch at all.
 *
 * Layout transcribed from the vendor's published specification:
 * https://api.netcash.co.za/inbound-payments/dc/debi-check-2/
 *
 *   H  header       "H", service key, version "1", instruction, batch name,
 *                   action date CCYYMMDD, software vendor key
 *   K  key record   the field identifiers each T record carries, ascending
 *   T  transaction  values in the order the K record declared
 *   F  footer       "F", transaction count, sum of amounts, "9999"
 */

/**
 * Field identifiers used by a DebiCheck collection record.
 *
 * The K record must list these in ascending order and each T record must supply
 * them in that same order — so the order here is not a style choice, it is the
 * contract.
 */
export const FIELD = {
  ACCOUNT_REFERENCE: 101,  // AN22, unique client reference
  AMOUNT_CENTS: 162,       // N, amount in CENTS
  TRACKING_DAYS: 232,      // N2, 1–10
  MANDATE_REFERENCE: 249,  // AN50, the approved mandate reference
} as const

/**
 * The software vendor key that goes in the header.
 *
 * Netcash publishes this default for integrators without an Independent
 * Software Vendor agreement. A vendor-specific GUID is issued only under an ISV
 * agreement and is *not* a prerequisite for going live — which is worth knowing
 * before assuming onboarding is blocked on one.
 */
export const DEFAULT_SOFTWARE_VENDOR_KEY = '24ade73c-98cf-47b3-99be-cc7b867b3080'

/** Netcash's default tracking window for a DebiCheck collection. */
export const DEFAULT_TRACKING_DAYS = 3

export type BatchRow = {
  /** Our reference for this collection — AN22, so it is truncated, not rejected. */
  accountReference: string
  /** The authorised DebiCheck mandate reference (contract reference). */
  mandateReference: string
  /** Rands. Converted to cents here, in exactly one place. */
  amountRands: number
  trackingDays?: number
}

export type BatchFileInput = {
  serviceKey: string
  batchName: string
  /** The day the collection should act, as a Date. */
  actionDate: Date
  softwareVendorKey?: string
  rows: ReadonlyArray<BatchRow>
}

/**
 * Rands to cents.
 *
 * Field 162 is denominated in **cents** while every amount in this system is in
 * rands. Sending R450.00 as `450` would collect four rand fifty; sending it as
 * `450.00` would be rejected as a non-integer. This is the only place the
 * conversion happens, and it rounds rather than truncates so a half-cent from a
 * fee calculation cannot silently disappear.
 */
export function toCents(rands: number): number {
  if (!Number.isFinite(rands)) throw new Error('Amount must be a finite number')
  const cents = Math.round((rands + Number.EPSILON) * 100)
  if (cents <= 0) throw new Error('Amount must be greater than zero')
  return cents
}

/** CCYYMMDD, in local (South African) terms — Netcash dates are not UTC instants. */
export function formatActionDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

/**
 * A value that cannot break the record structure.
 *
 * Tab is the field delimiter and newline the record delimiter, so either one
 * inside a member's account name would silently shift every following field by
 * one — a collection against the wrong reference rather than a rejected file.
 */
function sanitise(value: string, maxLength: number): string {
  return value.replace(/[\t\r\n]+/g, ' ').trim().slice(0, maxLength)
}

/**
 * Build a DebiCheck collection batch file.
 *
 * Returns the file exactly as `BatchFileUpload` expects it, plus the totals the
 * footer declares — the caller keeps those so a load report can be checked
 * against what was actually submitted rather than against what it hoped.
 */
export function buildDebiCheckBatchFile(input: BatchFileInput): {
  file: string
  transactionCount: number
  totalCents: number
} {
  if (input.rows.length === 0) throw new Error('A batch must contain at least one transaction')

  const fields = [
    FIELD.ACCOUNT_REFERENCE,
    FIELD.AMOUNT_CENTS,
    FIELD.TRACKING_DAYS,
    FIELD.MANDATE_REFERENCE,
  ]

  const header = [
    'H',
    input.serviceKey,
    '1',
    'DebiCheck',
    sanitise(input.batchName, 30),
    formatActionDate(input.actionDate),
    input.softwareVendorKey ?? DEFAULT_SOFTWARE_VENDOR_KEY,
  ].join('\t')

  const keyRecord = ['K', ...fields.map(String)].join('\t')

  let totalCents = 0
  const transactions = input.rows.map((row) => {
    const cents = toCents(row.amountRands)
    totalCents += cents
    const days = row.trackingDays ?? DEFAULT_TRACKING_DAYS
    if (days < 1 || days > 10) throw new Error('DebiCheck tracking days must be between 1 and 10')

    return [
      'T',
      sanitise(row.accountReference, 22),
      String(cents),
      String(days),
      sanitise(row.mandateReference, 50),
    ].join('\t')
  })

  const footer = ['F', String(input.rows.length), String(totalCents), '9999'].join('\t')

  return {
    file: [header, keyRecord, ...transactions, footer].join('\n'),
    transactionCount: input.rows.length,
    totalCents,
  }
}
