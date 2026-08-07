import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// The Netcash DebiCheck adapter, against the vendor's published contract.
//
// The adapter this replaces issued JSON POSTs to REST paths that do not exist
// (`/mandate/create`, `/debit/once-off`) with the service key in an
// `X-Service-Key` header. The real service is WCF SOAP at NIWS_NIF.svc and
// takes the key as a method parameter, so none of it could ever have worked.
//
// There is no sandbox to test against, so these tests hold the adapter to the
// documented contract instead: the envelope it builds, the parameter names and
// their order, the batch file layout, and what each response code means. Every
// expectation below is transcribed from the vendor's own schema and docs, not
// from this codebase.
// ---------------------------------------------------------------------------

vi.mock('@/lib/env', () => ({
  env: {
    NETCASH_SERVICE_KEY: 'svc-key-123',
    NETCASH_API_URL: 'https://ws.netcash.co.za/NIWS/NIWS_NIF.svc',
    NETCASH_WEBHOOK_SECRET: 'secret',
  },
}))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  buildDebiCheckBatchFile,
  toCents,
  DEFAULT_SOFTWARE_VENDOR_KEY,
} from '@/lib/netcash/batch-file'
import { xmlEscape, extractElement, parseSoapFault } from '@/lib/netcash/soap'
import { isConfigurationFailure, isSuccess, NETCASH_CODES } from '@/lib/netcash/response-codes'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

function soapResponse(inner: string) {
  return {
    ok: true,
    status: 200,
    text: async () =>
      `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${inner}</s:Body></s:Envelope>`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------

describe('the SOAP envelope', () => {
  it('posts to NIWS_NIF with the SOAPAction the WSDL declares', async () => {
    fetchMock.mockResolvedValue(soapResponse('<IsValidServiceKeyResult>000</IsValidServiceKeyResult>'))
    const { isValidServiceKey } = await import('@/lib/netcash/methods')

    await isValidServiceKey({ serviceKey: 'svc-key-123', softwareVendorCode: 'vendor' })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://ws.netcash.co.za/NIWS/NIWS_NIF.svc')
    // Verified against the live WSDL, not guessed. A wrong SOAPAction is
    // rejected by WCF before any parameter is even read.
    expect(init.headers.SOAPAction).toBe('http://tempuri.org/INIWS_NIF/IsValidServiceKey')
    expect(init.headers['Content-Type']).toMatch(/text\/xml/)
    expect(init.body).toContain('xmlns="http://tempuri.org/"')
  })

  it('sends the service key as a method parameter, never as a header', async () => {
    fetchMock.mockResolvedValue(soapResponse('<IsValidServiceKeyResult>000</IsValidServiceKeyResult>'))
    const { isValidServiceKey } = await import('@/lib/netcash/methods')

    await isValidServiceKey({ serviceKey: 'svc-key-123', softwareVendorCode: 'vendor' })

    const [, init] = fetchMock.mock.calls[0]!
    expect(init.body).toContain('<ServiceKey>svc-key-123</ServiceKey>')
    // The old adapter's central mistake.
    expect(init.headers['X-Service-Key']).toBeUndefined()
  })

  it("reproduces the vendor's misspelled SofwareVendorCode verbatim", async () => {
    fetchMock.mockResolvedValue(soapResponse('<IsValidServiceKeyResult>000</IsValidServiceKeyResult>'))
    const { isValidServiceKey } = await import('@/lib/netcash/methods')

    await isValidServiceKey({ serviceKey: 'k', softwareVendorCode: 'vendor-guid' })

    const [, init] = fetchMock.mock.calls[0]!
    // Misspelled in Netcash's own schema. Spelling it correctly is what breaks.
    expect(init.body).toContain('<SofwareVendorCode>vendor-guid</SofwareVendorCode>')
    expect(init.body).not.toContain('<SoftwareVendorCode>')
  })

  it('sends the cancel reason with the lower-case name the schema uses', async () => {
    fetchMock.mockResolvedValue(soapResponse('<ErrorCode>000</ErrorCode>'))
    const { debiCheckCancel } = await import('@/lib/netcash/methods')

    await debiCheckCancel({ serviceKey: 'k', contractReference: 'C1', reasonCode: '01' })

    const [, init] = fetchMock.mock.calls[0]!
    expect(init.body).toContain('<reasonCode>01</reasonCode>')
    expect(init.body).not.toContain('<ReasonCode>')
  })

  it('sends DebiCheckAuthenticate parameters in the documented order', async () => {
    fetchMock.mockResolvedValue(soapResponse('<ErrorCode>000</ErrorCode><Status>Accepted</Status>'))
    const { debiCheckAuthenticate } = await import('@/lib/netcash/methods')

    await debiCheckAuthenticate({
      serviceKey: 'k', accountReference: 'REF1', mandateTemplateId: 'NCDCT000000001',
      isIdNumber: true, debtorIdentification: '9001015800085', accountName: 'T Mahlangu',
      bankAccountName: 'T Mahlangu', branchCode: '250655', bankAccountNumber: '123456789',
      bankAccountType: 'Cheque', mobileNumber: '0821234567', emailAddress: 't@x.co.za',
      collectionAmount: 450, firstCollectionDiffers: false, firstCollectionAmount: 450,
      firstCollectionDate: '20260901', collectionDayCode: '01',
    })

    const body = fetchMock.mock.calls[0]![1].body as string
    const order = [
      'ServiceKey', 'AccountReference', 'DebiCheckMandateTemplateId', 'IsIdNumber',
      'DebtorIdentification', 'AccountName', 'BankAccountName', 'BranchCode',
      'BankAccountNumber', 'BankAccountType', 'MobileNumber', 'EmailAddress',
      'CollectionAmount', 'FirstCollectionDiffers', 'FirstCollectionAmount',
      'FirstCollectionDate', 'collectionDayCode',
    ]
    const positions = order.map((name) => body.indexOf(`<${name}>`))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('escapes a value that would otherwise break the envelope', () => {
    // A member legitimately named "Mbeki & Sons" would produce malformed XML
    // and a failed collection.
    expect(xmlEscape('Mbeki & Sons <Pty>')).toBe('Mbeki &amp; Sons &lt;Pty&gt;')
  })

  it('surfaces a SOAP fault as its reason rather than as an HTTP failure', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () =>
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>Service key invalid</faultstring></s:Fault></s:Body></s:Envelope>',
    })
    const { isValidServiceKey } = await import('@/lib/netcash/methods')

    await expect(
      isValidServiceKey({ serviceKey: 'bad', softwareVendorCode: 'v' }),
    ).rejects.toThrow('Service key invalid')
  })
})

// ---------------------------------------------------------------------------
// The collection batch file
// ---------------------------------------------------------------------------

describe('the DebiCheck batch file', () => {
  const base = {
    serviceKey: 'svc-key-123',
    batchName: 'debit-run-2026-09',
    actionDate: new Date(2026, 8, 1), // 1 September 2026, local
  }

  it('converts rands to cents — the 100x error waiting to happen', () => {
    // Field 162 is denominated in cents while the whole system is in rands.
    expect(toCents(450)).toBe(45000)
    expect(toCents(450.55)).toBe(45055)
    // Float dust must not cost a cent either way.
    expect(toCents(0.1 + 0.2)).toBe(30)
  })

  it('refuses an amount that would collect nothing', () => {
    expect(() => toCents(0)).toThrow()
    expect(() => toCents(-5)).toThrow()
    expect(() => toCents(Number.NaN)).toThrow()
  })

  it('writes the H/K/T/F records the specification describes', () => {
    const { file, transactionCount, totalCents } = buildDebiCheckBatchFile({
      ...base,
      rows: [
        { accountReference: 'CTR-1', mandateReference: 'MND-1', amountRands: 450 },
        { accountReference: 'CTR-2', mandateReference: 'MND-2', amountRands: 300.50 },
      ],
    })

    const lines = file.split('\n')
    expect(lines[0]!.split('\t')).toEqual([
      'H', 'svc-key-123', '1', 'DebiCheck', 'debit-run-2026-09', '20260901',
      DEFAULT_SOFTWARE_VENDOR_KEY,
    ])
    // The key record declares which fields each T carries, in ascending order.
    expect(lines[1]!.split('\t')).toEqual(['K', '101', '162', '232', '249'])
    expect(lines[2]!.split('\t')).toEqual(['T', 'CTR-1', '45000', '3', 'MND-1'])
    expect(lines[3]!.split('\t')).toEqual(['T', 'CTR-2', '30050', '3', 'MND-2'])
    expect(lines[4]!.split('\t')).toEqual(['F', '2', '75050', '9999'])

    expect(transactionCount).toBe(2)
    expect(totalCents).toBe(75050)
  })

  it('strips tabs and newlines out of a member reference', () => {
    // A tab inside a value shifts every following field by one — a collection
    // against the wrong mandate rather than a rejected file.
    const { file } = buildDebiCheckBatchFile({
      ...base,
      rows: [{ accountReference: 'CTR\t1\nX', mandateReference: 'MND-1', amountRands: 10 }],
    })
    const t = file.split('\n').find((l) => l.startsWith('T'))!
    expect(t.split('\t')).toHaveLength(5)
    expect(t.split('\t')[1]).toBe('CTR 1 X')
  })

  it('holds tracking days inside the documented 1-10 range', () => {
    expect(() => buildDebiCheckBatchFile({
      ...base,
      rows: [{ accountReference: 'A', mandateReference: 'M', amountRands: 10, trackingDays: 11 }],
    })).toThrow()
  })

  it('refuses to build an empty batch', () => {
    expect(() => buildDebiCheckBatchFile({ ...base, rows: [] })).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Response codes
// ---------------------------------------------------------------------------

describe('response codes', () => {
  it('treats only 000 and 001 as success', () => {
    expect(isSuccess(NETCASH_CODES.SUCCESS)).toBe(true)
    expect(isSuccess(NETCASH_CODES.PASSED_VALIDATION)).toBe(true)
    expect(isSuccess(NETCASH_CODES.FAILED)).toBe(false)
    expect(isSuccess(NETCASH_CODES.INSUFFICIENT_FUNDS)).toBe(false)
  })

  it('separates our misconfiguration from a member being declined', () => {
    // These mean the whole circle is affected and a human is needed now.
    expect(isConfigurationFailure(NETCASH_CODES.INCORRECT_SERVICE_KEY)).toBe(true)
    expect(isConfigurationFailure(NETCASH_CODES.SERVICE_KEY_NOT_VALID_FOR_SERVICE)).toBe(true)
    expect(isConfigurationFailure(NETCASH_CODES.MERCHANT_INACTIVE)).toBe(true)

    // These are one member's bank saying no. Filing the first kind as the
    // second would mark fifty members delinquent and tell them all their
    // debit bounced.
    expect(isConfigurationFailure(NETCASH_CODES.INSUFFICIENT_FUNDS)).toBe(false)
    expect(isConfigurationFailure(NETCASH_CODES.FAILED)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Batch submission semantics
// ---------------------------------------------------------------------------

describe('submitting a batch', () => {
  it('treats a file token as PENDING, never as money collected', async () => {
    fetchMock.mockResolvedValue(soapResponse(
      '<BatchFileUploadResult>20000000.2550236530.0483.2.2</BatchFileUploadResult>',
    ))
    const { batchFileUpload } = await import('@/lib/netcash/methods')

    const result = await batchFileUpload({ serviceKey: 'k', file: 'H\t...' })

    // A token means "accepted for processing". The bank has not answered and no
    // money has moved; recording it as SUCCESS would credit a contribution that
    // may still be declined.
    expect(result.ok).toBe(true)
    expect(result.fileToken).toBe('20000000.2550236530.0483.2.2')
  })

  it('reads an error code returned in place of a token', async () => {
    fetchMock.mockResolvedValue(soapResponse('<BatchFileUploadResult>106</BatchFileUploadResult>'))
    const { batchFileUpload } = await import('@/lib/netcash/methods')

    const result = await batchFileUpload({ serviceKey: 'wrong', file: 'H\t...' })

    expect(result.ok).toBe(false)
    expect(result.fileToken).toBeNull()
    expect(result.configurationFailure).toBe(true)
  })

  it('does not mistake "FILE NOT READY" for a finished batch', async () => {
    fetchMock.mockResolvedValue(soapResponse(
      '<RequestFileUploadReportResult>FILE NOT READY</RequestFileUploadReportResult>',
    ))
    const { requestFileUploadReport } = await import('@/lib/netcash/methods')

    const result = await requestFileUploadReport({ serviceKey: 'k', fileToken: 't' })

    // A documented, expected answer while processing continues — not a failure.
    expect(result.ready).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

describe('reading a response', () => {
  it('reads an element regardless of namespace prefix', () => {
    expect(extractElement('<a:ErrorCode>000</a:ErrorCode>', 'ErrorCode')).toBe('000')
    expect(extractElement('<ErrorCode>203</ErrorCode>', 'ErrorCode')).toBe('203')
  })

  it('distinguishes an empty element from a missing one', () => {
    // Empty means Netcash answered with nothing; missing means we asked for the
    // wrong element. Collapsing them hides a contract mismatch.
    expect(extractElement('<Status/>', 'Status')).toBe('')
    expect(extractElement('<Other>x</Other>', 'Status')).toBeNull()
  })

  it('recognises a fault body', () => {
    const fault = parseSoapFault('<s:Fault><faultstring>Boom</faultstring></s:Fault>')
    expect(fault?.reason).toBe('Boom')
    expect(parseSoapFault('<ErrorCode>000</ErrorCode>')).toBeNull()
  })
})
