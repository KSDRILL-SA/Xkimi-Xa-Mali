/**
 * Netcash web service response codes.
 *
 * Transcribed from the vendor's published table, not inferred from behaviour:
 * https://api.netcash.co.za/ws-methods/web-service-response-codes/
 *
 * These are the codes every NIF method answers with. `000` is the only success
 * for a submission and `001` the only success for a validation — everything
 * else is a refusal, and the distinction between *kinds* of refusal is what
 * decides whether a member gets retried, told, or left alone.
 */
export const NETCASH_CODES = {
  SUCCESS: '000',
  PASSED_VALIDATION: '001',
  AUTHENTICATION: '100',
  DATE_FORMAT: '101',
  INVALID_DATE: '102',
  INVALID_AMOUNT: '103',
  MERCHANT_INACTIVE: '104',
  SERVICE_ID_INACTIVE: '105',
  INCORRECT_SERVICE_KEY: '106',
  ACCOUNT_LOCKED: '201',
  ITEM_NOT_FOUND: '202',
  FAILED: '203',
  ACCOUNT_NOT_FOUND: '300',
  DUPLICATE_REFERENCE: '301',
  SERVICE_KEY_NOT_VALID_FOR_SERVICE: '311',
  BATCH_GUID_INVALID: '317',
  INSUFFICIENT_FUNDS: '323',
  NON_REALTIME_TEMPLATE: '325',
  INVALID_CONTRACT_REFERENCE: '326',
  INVALID_CANCELLATION_REASON: '327',
  AVS_BANK_OFFLINE: '328',
  AMENDMENT_REJECTED: '329',
} as const

const MESSAGES: Record<string, string> = {
  '000': 'Success',
  '001': 'Passed validation',
  '100': 'Authentication failed',
  '101': 'Invalid date format',
  '102': 'Invalid date',
  '103': 'Invalid amount',
  '104': 'Netcash merchant code is inactive or invalid',
  '105': 'Netcash service ID is inactive or invalid',
  '106': 'Incorrect or inactive service key',
  '201': 'Account locked',
  '202': 'Item not found',
  '203': 'Failed',
  '300': 'Account not found',
  '301': 'Duplicate merchant reference',
  '311': 'Service key is not valid for this service',
  '317': 'Batch GUID invalid',
  '323': 'Insufficient funds available',
  '325': 'Mandate template is not a real-time DebiCheck template',
  '326': 'Invalid DebiCheck contract reference',
  '327': 'Invalid DebiCheck cancellation reason code',
  '328': 'Account verification sent to bank offline',
  '329': 'DebiCheck amendment rejected',
}

export function describeCode(code: string): string {
  return MESSAGES[code] ?? `Netcash returned code ${code}`
}

export function isSuccess(code: string): boolean {
  return code === NETCASH_CODES.SUCCESS || code === NETCASH_CODES.PASSED_VALIDATION
}

/**
 * Whether a refusal is about *our* configuration rather than the member.
 *
 * This distinction is load-bearing. A wrong service key and a declined debit
 * both come back as a non-zero code, but they mean opposite things: one is an
 * outage affecting every member and needs a human immediately, the other is one
 * member's bank saying no. Filing the first as a member's failed payment would
 * mark the whole circle delinquent and tell fifty people their debit bounced.
 */
export function isConfigurationFailure(code: string): boolean {
  return (
    code === NETCASH_CODES.AUTHENTICATION ||
    code === NETCASH_CODES.MERCHANT_INACTIVE ||
    code === NETCASH_CODES.SERVICE_ID_INACTIVE ||
    code === NETCASH_CODES.INCORRECT_SERVICE_KEY ||
    code === NETCASH_CODES.SERVICE_KEY_NOT_VALID_FOR_SERVICE ||
    code === NETCASH_CODES.NON_REALTIME_TEMPLATE
  )
}
