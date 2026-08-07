/**
 * The NIWS_NIF methods this system uses.
 *
 * Every parameter name and its position is transcribed from the service's own
 * schema at `https://ws.netcash.co.za/NIWS/NIWS_NIF.svc?xsd=xsd0`, not inferred.
 * XML element names are case-sensitive and WCF rejects an unexpected one, so
 * two details below are deliberate rather than typos on our side:
 *
 *   - `reasonCode` on the cancel call is lower-case where its siblings are not.
 *   - `SofwareVendorCode` on IsValidServiceKey is misspelled **in the vendor's
 *     schema**. Spelling it correctly is what would break.
 */
import { callNiws, buildParams, extractElement, extractAll } from './soap'
import { describeCode, isSuccess, isConfigurationFailure, NETCASH_CODES } from './response-codes'

export type NiwsResult = {
  code: string
  message: string
  ok: boolean
  configurationFailure: boolean
  raw: string
}

function readResult(xml: string): NiwsResult {
  // NIF answers with either <ErrorCode> or a bare <...Result> depending on the
  // method. Both are read; whichever is present wins.
  const code =
    extractElement(xml, 'ErrorCode') ??
    extractElement(xml, 'IsValidServiceKeyResult') ??
    extractElement(xml, 'BatchFileUploadResult') ??
    ''

  const messages = extractAll(xml, 'Message')
  return {
    code,
    message: messages.length > 0 ? messages.join('; ') : describeCode(code),
    ok: isSuccess(code),
    configurationFailure: isConfigurationFailure(code),
    raw: xml,
  }
}

/**
 * Confirm the service key is live and authorised for debit orders.
 *
 * Cheap, read-only, and the single most useful thing to call before a debit
 * run: an expired or unauthorised key otherwise surfaces as fifty members
 * appearing to have had their payments declined.
 */
export async function isValidServiceKey(params: {
  serviceKey: string
  methodKey?: string
  instructionCode?: string
  softwareVendorCode: string
}): Promise<NiwsResult> {
  const xml = await callNiws('IsValidServiceKey', buildParams([
    ['MethodKey', params.methodKey ?? 'IsValidServiceKey'],
    ['ServiceKey', params.serviceKey],
    ['InstructionCode', params.instructionCode ?? 'DebiCheck'],
    // Vendor's spelling. See the note at the top of this file.
    ['SofwareVendorCode', params.softwareVendorCode],
  ]))
  return readResult(xml)
}

export type AuthenticateParams = {
  serviceKey: string
  accountReference: string
  mandateTemplateId: string
  isIdNumber: boolean
  debtorIdentification: string
  accountName: string
  bankAccountName: string
  branchCode: string
  bankAccountNumber: string
  bankAccountType: string
  mobileNumber: string
  emailAddress: string
  collectionAmount: number
  firstCollectionDiffers: boolean
  firstCollectionAmount: number
  /** CCYYMMDD */
  firstCollectionDate: string
  collectionDayCode: string
}

export type AuthenticateResult = NiwsResult & {
  contractReference: string | null
  status: string | null
  bankResponseCode: string | null
  bankservResponseCode: string | null
}

/**
 * Submit a DebiCheck mandate for authentication (TT1, synchronous).
 *
 * This is the real-time path: the debtor's bank answers within the call rather
 * than through a later callback, which is why the documented minimum timeout is
 * three minutes.
 *
 * `CollectionAmount` here is in **rands** — unlike the batch file's field 162
 * and unlike the amend call, both of which are in cents. That inconsistency is
 * the vendor's, and it is the reason each conversion lives at exactly one call
 * site instead of being applied "somewhere in the adapter".
 */
export async function debiCheckAuthenticate(p: AuthenticateParams): Promise<AuthenticateResult> {
  const xml = await callNiws('DebiCheckAuthenticate', buildParams([
    ['ServiceKey', p.serviceKey],
    ['AccountReference', p.accountReference],
    ['DebiCheckMandateTemplateId', p.mandateTemplateId],
    ['IsIdNumber', p.isIdNumber ? 1 : 0],
    ['DebtorIdentification', p.debtorIdentification],
    ['AccountName', p.accountName],
    ['BankAccountName', p.bankAccountName],
    ['BranchCode', p.branchCode],
    ['BankAccountNumber', p.bankAccountNumber],
    ['BankAccountType', p.bankAccountType],
    ['MobileNumber', p.mobileNumber],
    ['EmailAddress', p.emailAddress],
    ['CollectionAmount', p.collectionAmount.toFixed(2)],
    ['FirstCollectionDiffers', p.firstCollectionDiffers ? 1 : 0],
    ['FirstCollectionAmount', p.firstCollectionAmount.toFixed(2)],
    ['FirstCollectionDate', p.firstCollectionDate],
    ['collectionDayCode', p.collectionDayCode],
  ]))

  const base = readResult(xml)
  return {
    ...base,
    contractReference: extractElement(xml, 'ContractReference'),
    status: extractElement(xml, 'Status'),
    bankResponseCode: extractElement(xml, 'BankResponseCode'),
    bankservResponseCode: extractElement(xml, 'BankservResponseCode'),
  }
}

export async function debiCheckCurrentStatus(params: {
  serviceKey: string
  contractReference: string
}): Promise<NiwsResult & { status: string | null }> {
  const xml = await callNiws('DebiCheckAuthenticationCurrentStatus', buildParams([
    ['ServiceKey', params.serviceKey],
    ['ContractReference', params.contractReference],
  ]))
  return { ...readResult(xml), status: extractElement(xml, 'Status') }
}

export async function debiCheckCancel(params: {
  serviceKey: string
  contractReference: string
  reasonCode: string
}): Promise<NiwsResult> {
  const xml = await callNiws('DebiCheckCancelAuthentication', buildParams([
    ['ServiceKey', params.serviceKey],
    ['ContractReference', params.contractReference],
    // Lower-case in the vendor's schema. See the note at the top of this file.
    ['reasonCode', params.reasonCode],
  ]))
  return readResult(xml)
}

/**
 * Amend an authorised mandate's amount without re-authenticating the debtor.
 *
 * Both amounts are in **cents**, per the schema — the opposite of
 * `DebiCheckAuthenticate`, which takes rands.
 */
export async function debiCheckAmend(params: {
  serviceKey: string
  contractReference: string
  collectionAmountCents: number
  maximumCollectionAmountCents: number
}): Promise<NiwsResult> {
  const xml = await callNiws('DebiCheckAmendAuthentication', buildParams([
    ['ServiceKey', params.serviceKey],
    ['ContractReference', params.contractReference],
    ['CollectionAmountInCents', Math.round(params.collectionAmountCents)],
    ['MaximumCollectionAmountInCents', Math.round(params.maximumCollectionAmountCents)],
  ]))
  return readResult(xml)
}

/**
 * Upload a collection batch.
 *
 * On success the response is a **file token** ("20000000.2550236530.0483.2.2"),
 * not a settlement. The money has not moved and nothing has been accepted yet —
 * the outcome is fetched afterwards with {@link requestFileUploadReport}. Any
 * caller that treats a token as a successful collection is recording money that
 * has not been taken.
 */
export async function batchFileUpload(params: {
  serviceKey: string
  file: string
}): Promise<NiwsResult & { fileToken: string | null }> {
  const xml = await callNiws('BatchFileUpload', buildParams([
    ['ServiceKey', params.serviceKey],
    ['File', params.file],
  ]))

  const result = extractElement(xml, 'BatchFileUploadResult') ?? ''

  // A token and an error code are both returned in the same element. A token
  // carries dots and is longer than any documented code, which is what tells
  // them apart.
  const looksLikeToken = result.includes('.') && result.length > 8
  return {
    code: looksLikeToken ? NETCASH_CODES.SUCCESS : result,
    message: looksLikeToken ? 'Batch accepted for processing' : describeCode(result),
    ok: looksLikeToken,
    configurationFailure: !looksLikeToken && isConfigurationFailure(result),
    raw: xml,
    fileToken: looksLikeToken ? result : null,
  }
}

export async function requestFileUploadReport(params: {
  serviceKey: string
  fileToken: string
}): Promise<NiwsResult & { report: string | null; ready: boolean }> {
  const xml = await callNiws('RequestFileUploadReport', buildParams([
    ['ServiceKey', params.serviceKey],
    ['FileToken', params.fileToken],
  ]))

  const report = extractElement(xml, 'RequestFileUploadReportResult')
  // "FILE NOT READY" is a documented, expected answer — the batch is still
  // being processed. It is not a failure and must not be recorded as one.
  const ready = !!report && !/FILE NOT READY/i.test(report)

  return {
    code: ready ? NETCASH_CODES.SUCCESS : 'FILE NOT READY',
    message: ready ? 'Report retrieved' : 'Batch is still being processed',
    ok: ready,
    configurationFailure: false,
    raw: xml,
    report,
    ready,
  }
}
