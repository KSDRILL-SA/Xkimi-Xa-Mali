/**
 * The SOAP transport for Netcash's NIWS web services.
 *
 * Netcash's DebiCheck API is a **WCF SOAP** service. The adapter this replaces
 * issued JSON POSTs to invented REST paths (`/mandate/create`, `/debit/once-off`)
 * with the service key in an `X-Service-Key` header. None of those exist. The
 * real service takes the key as a *method parameter*, and every call is a SOAP
 * envelope.
 *
 * Verified against the live WSDL at
 * `https://ws.netcash.co.za/NIWS/NIWS_NIF.svc?wsdl` rather than inferred:
 *
 *   targetNamespace  http://tempuri.org/
 *   contract         INIWS_NIF
 *   SOAPAction       http://tempuri.org/INIWS_NIF/<Method>
 *
 * SOAP 1.1 (text/xml + SOAPAction header). The Partner endpoint uses SOAP 1.2
 * with WS-Addressing; NIF does not, and this module only speaks to NIF.
 */
import { env } from '@/lib/env'
import { logger } from '@xxm/observability'

export const NIWS_NIF_URL = 'https://ws.netcash.co.za/NIWS/NIWS_NIF.svc'
const TEMPURI = 'http://tempuri.org/'
const SOAP_ENV = 'http://schemas.xmlsoap.org/soap/envelope/'

/** DebiCheck authentication is documented as needing at least three minutes. */
export const NETCASH_TIMEOUT_MS = 3 * 60 * 1000

export class NetcashSoapError extends Error {
  constructor(
    message: string,
    public readonly method: string,
    public readonly httpStatus?: number,
    public readonly faultCode?: string,
  ) {
    super(message)
    this.name = 'NetcashSoapError'
  }
}

/**
 * XML-escape a parameter value.
 *
 * Every value we send is caller-influenced somewhere upstream — an account
 * name, a reference, a batch of them concatenated into a file. Escaping is not
 * cosmetic here: an unescaped `&` in a member's account name produces a
 * malformed envelope and a failed collection, and a `<` would let a value close
 * a tag it does not own.
 */
export function xmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Read a single element's text out of a SOAP response.
 *
 * Deliberately narrow rather than a general XML parser: these responses have a
 * known, flat shape, and adding an XML dependency to this tree needs more
 * justification than four lines of matching. It handles the namespace prefix
 * WCF emits (`<a:ErrorCode>`) and self-closing empty elements.
 *
 * If Netcash ever returns nested or repeated elements under the same name, this
 * returns the first — which is why `parseSoapFault` runs first and why callers
 * check the documented response codes rather than trusting shape.
 */
export function extractElement(xml: string, localName: string): string | null {
  const selfClosing = new RegExp(`<(?:\\w+:)?${localName}\\s*/>`)
  if (selfClosing.test(xml)) return ''

  const match = new RegExp(
    `<(?:\\w+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${localName}>`,
  ).exec(xml)
  if (!match) return null

  return decodeXml(match[1] ?? '')
}

/** Every element's text, for repeated nodes such as `<Messages>`. */
export function extractAll(xml: string, localName: string): string[] {
  const re = new RegExp(
    `<(?:\\w+:)?${localName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${localName}>`,
    'g',
  )
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(decodeXml(m[1] ?? ''))
  return out
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

/**
 * A SOAP fault is an HTTP 500 with a body that explains itself. Treating it as
 * a transport failure would throw away the only useful part.
 */
export function parseSoapFault(xml: string): { code: string; reason: string } | null {
  if (!/<(?:\w+:)?Fault[\s>]/.test(xml)) return null
  return {
    code: extractElement(xml, 'faultcode') ?? extractElement(xml, 'Value') ?? 'SOAP_FAULT',
    reason: extractElement(xml, 'faultstring') ?? extractElement(xml, 'Text') ?? 'Unknown SOAP fault',
  }
}

/** `<Name>value</Name>` for each parameter, in the order the contract lists. */
export function buildParams(params: ReadonlyArray<readonly [string, string | number]>): string {
  return params.map(([k, v]) => `<${k}>${xmlEscape(v)}</${k}>`).join('')
}

/**
 * Call a NIWS_NIF method and return the raw response XML.
 *
 * The service key is never logged. It is the single credential that authorises
 * money movement on the account, and an error path that prints the request body
 * is how it would end up in a log aggregator.
 */
export async function callNiws(method: string, paramsXml: string): Promise<string> {
  const endpoint = env.NETCASH_API_URL || NIWS_NIF_URL
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="${SOAP_ENV}">` +
    `<soap:Body><${method} xmlns="${TEMPURI}">${paramsXml}</${method}></soap:Body>` +
    `</soap:Envelope>`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), NETCASH_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `${TEMPURI}INIWS_NIF/${method}`,
      },
      body: envelope,
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new NetcashSoapError(`Netcash ${method} timed out`, method, 408)
    }
    throw new NetcashSoapError(
      `Netcash ${method} could not be reached: ${err instanceof Error ? err.message : String(err)}`,
      method,
    )
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()

  const fault = parseSoapFault(text)
  if (fault) {
    logger.error('Netcash SOAP fault', { method, faultCode: fault.code, reason: fault.reason })
    throw new NetcashSoapError(fault.reason, method, res.status, fault.code)
  }

  if (!res.ok) {
    throw new NetcashSoapError(`Netcash ${method} returned HTTP ${res.status}`, method, res.status)
  }

  return text
}
