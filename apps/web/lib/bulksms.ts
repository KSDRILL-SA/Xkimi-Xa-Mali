import { createHmac, timingSafeEqual } from 'crypto'
import { env } from './env'
import { withRetry } from './retry'
import { ExternalServiceError } from './errors'

const BULKSMS_API_URL = 'https://api.bulksms.com/v1'

export type BulkSMSRoutingGroup = 'ECONOMY' | 'STANDARD' | 'PREMIUM'

export type BulkSMSDeliveryStatus =
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'UNKNOWN'

export type BulkSMSMessage = {
  id: string
  status: { type: BulkSMSDeliveryStatus; id: string }
  creditCost: number
  to: { address: string; type: 'INTERNATIONAL' | 'GROUP' }
  from: string
  body: string
  encoding: 'TEXT' | 'UNICODE' | 'BINARY'
  protocolId: number
  messageClass: number
  numberOfParts: number
  credits: number
  isLongMessage: boolean
  submissionDate: string
  userSuppliedId?: string
  type: 'TEXT' | 'UNICODE' | 'BINARY'
}

export type BulkSMSSendInput = {
  to: string
  body: string
  /**
   * Sender ID for this message. Unset by default and unusable on South
   * African networks — see `senderFields` below for why.
   */
  from?: string
  userSuppliedId?: string
  routingGroup?: BulkSMSRoutingGroup
}

export type BulkSMSDeliveryReceipt = {
  id: string
  status: { type: BulkSMSDeliveryStatus; id: string }
  userSuppliedId?: string
  to: { address: string }
  creditCost: number
  submissionDate: string
  statusChangedDate: string
}

class BulkSMSError extends Error {
  constructor(public readonly statusCode: number, detail: string) {
    super(`BulkSMS ${statusCode}: ${detail}`)
    this.name = 'BulkSMSError'
  }
}

function authHeader(): string {
  if (!env.BULKSMS_USERNAME || !env.BULKSMS_PASSWORD) {
    throw new Error('BulkSMS credentials not configured (BULKSMS_USERNAME / BULKSMS_PASSWORD)')
  }
  return `Basic ${Buffer.from(`${env.BULKSMS_USERNAME}:${env.BULKSMS_PASSWORD}`).toString('base64')}`
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>

  let detail = res.statusText
  try {
    const body = (await res.json()) as { type?: string; detail?: string }
    detail = body.detail ?? body.type ?? res.statusText
  } catch { /* non-JSON body */ }

  throw new BulkSMSError(res.status, detail)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BULKSMS_API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseResponse<T>(res)
}

/**
 * The `from` BulkSMS should show the recipient, when one is supplied.
 *
 * ── Deliberately unset in South Africa, which is this platform's only market ─
 *
 * An earlier version of this file added a `BULKSMS_SENDER_ID` env var to fix
 * "SMS arrives from an unknown number". That fix does not work here, and the
 * var was removed rather than left as a setting nobody can use: BulkSMS states
 * plainly that **"Sender IDs are not available in South Africa due to mobile
 * network operator policies"** — it is not a registration step we have skipped,
 * the networks refuse them outright.
 *
 * What SA requires instead: identify the organisation at the START of the
 * message body, and include a contact number or website in the body. Every
 * template in packages/database/prisma/templates.ts already leads with
 * "Xkimi Xa Mali Foundation", and the two hard-coded messages
 * (invite.service.ts, member.service.ts) were brought into line with it.
 * Enforced by packages/database/prisma/__tests__/sms-sa-compliance.test.ts.
 *
 * The parameter is kept because the API supports it and a future non-SA
 * destination could legitimately use one — it simply has no configured
 * default.
 *
 * Source: https://www.bulksms.com/countries/s/south-africa
 */
function senderFields(explicit?: string): { from: string } | Record<string, never> {
  return explicit ? { from: explicit } : {}
}

/** The name every outgoing SMS must carry, because the sender field cannot. */
const ORG_NAME = 'Xkimi Xa Mali Foundation'

/**
 * Guarantees the Foundation is named at the start of every SMS we send.
 *
 * ── Why this is enforced here and not in the copy ───────────────────────────
 *
 * Naming the sender is a *sending* rule, not a seed-data rule, and it was
 * previously only true of the copy in `prisma/templates.ts`. Three separate
 * paths went out without it:
 *
 *   1. **The seeded templates in production.** `prisma/seed.ts` upserts with
 *      `update: {}` — deliberately create-only, so an admin can edit a body in
 *      the DB without the next deploy stamping over it. The consequence is
 *      that editing `templates.ts` changes nothing for a database that has
 *      already been seeded. Every fix to that file since the first deploy has
 *      been invisible in production, which is why the name still did not
 *      appear after it was added there.
 *   2. **Admin broadcasts** (`admin.service.ts`), where the body is typed by a
 *      person into a box and has never passed through a template at all.
 *   3. **Anything added later** — the rule is invisible, so the next
 *      hard-coded message forgets it exactly the way the first two did.
 *
 * A recipient sees an unrecognised number. If the body does not say who sent
 * it, an SMS about someone's money is indistinguishable from a scam, and the
 * correct response to a scam is to ignore it — so an unattributed message is
 * not merely unbranded, it is one the member is right not to act on.
 *
 * Idempotent: a body that already opens with the name is returned untouched,
 * so the 25 templates that get this right are unaffected, and re-running it
 * can never stack the prefix twice. The check is case-insensitive and
 * tolerates leading whitespace so a stray space does not produce
 * "Xkimi Xa Mali Foundation: Xkimi Xa Mali Foundation: ...".
 */
export function ensureSenderIdentity(body: string): string {
  const trimmed = body.trimStart()
  return trimmed.toLowerCase().startsWith(ORG_NAME.toLowerCase())
    ? trimmed
    : `${ORG_NAME}: ${trimmed}`
}

export async function sendSMS(input: BulkSMSSendInput): Promise<BulkSMSMessage[]> {
  return withRetry(
    () => post<BulkSMSMessage[]>('/messages', {
      to: input.to,
      body: ensureSenderIdentity(input.body),
      routingGroup: input.routingGroup ?? 'STANDARD',
      ...senderFields(input.from),
      ...(input.userSuppliedId && { userSuppliedId: input.userSuppliedId }),
    }),
    { maxAttempts: 3, baseDelayMs: 500, label: `BulkSMS.sendSMS(${input.to})` },
  ).catch((err) => {
    throw new ExternalServiceError('BulkSMS', err instanceof Error ? err.message : undefined)
  })
}

export async function sendBulkSMS(messages: BulkSMSSendInput[]): Promise<BulkSMSMessage[]> {
  if (messages.length === 0) return []

  return withRetry(
    () => post<BulkSMSMessage[]>('/messages', messages.map((m) => ({
      to: m.to,
      body: ensureSenderIdentity(m.body),
      routingGroup: m.routingGroup ?? 'STANDARD',
      ...senderFields(m.from),
      ...(m.userSuppliedId && { userSuppliedId: m.userSuppliedId }),
    }))),
    { maxAttempts: 3, baseDelayMs: 500, label: `BulkSMS.sendBulkSMS(${messages.length} msgs)` },
  ).catch((err) => {
    throw new ExternalServiceError('BulkSMS', err instanceof Error ? err.message : undefined)
  })
}

export async function getSMSStatus(messageId: string): Promise<BulkSMSMessage> {
  const res = await fetch(`${BULKSMS_API_URL}/messages/${messageId}`, {
    headers: { Authorization: authHeader() },
  })
  return parseResponse<BulkSMSMessage>(res)
}

export function verifyBulkSmsWebhook(
  body: string,
  signature: string,
  secret: string,
): boolean {
  // BulkSMS delivery receipts carry a HMAC-SHA256 signature header.
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  const exp = Buffer.from(expected, 'utf8')
  const got = Buffer.from(signature, 'utf8')
  return exp.length === got.length && timingSafeEqual(exp, got)
}

/** Normalise a SA phone number to E.164 (+27...) for BulkSMS */
export function normalisePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.startsWith('27') && d.length === 11) return `+${d}`
  if (d.startsWith('0') && d.length === 10) return `+27${d.slice(1)}`
  return phone
}
