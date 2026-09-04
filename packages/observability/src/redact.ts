/**
 * What log metadata is not allowed to carry.
 *
 * ── Why the logger redacts rather than trusting call sites ─────────────────
 *
 * Log metadata does not stay in the log. `logger.error` sends every entry to
 * **Sentry**, and `logger.warn` attaches one as a breadcrumb — so a field put
 * into a log line for local debugging leaves the country, lands with a
 * third-party processor, and is retained on their schedule rather than ours.
 * For a system holding ID numbers, bank details, phone numbers and financial
 * history, that turns a debugging convenience into a processor question.
 *
 * Removing the fields that were there is necessary and is not sufficient: the
 * next call site is written by somebody in a hurry, and `{ err }` on its own
 * looks harmless. So the guarantee is made here, once, where every call passes.
 *
 * ── The error-spread vector, which is the one nobody would look for ────────
 *
 * The logger serialises an `Error` by spreading its own enumerable properties
 * into the entry. That is a good feature — a gateway client attaching
 * `err.response` is exactly what you want to see. It also means an error thrown
 * by a mail or SMS provider can carry the recipient's address into Sentry
 * without any call site ever naming it. Redaction runs over the serialised
 * shape, so those are covered too.
 *
 * ── Deliberately narrow ────────────────────────────────────────────────────
 *
 * Contact details, identity numbers, banking details and credentials. Not
 * names, and not free text: a redactor broad enough to catch everything
 * redacts the message you needed and teaches people to stop trusting the logs.
 * Anything the redactor cannot see — a phone number written into a message
 * string — is a call-site problem and stays one.
 */

/**
 * Field names whose values never reach a log or Sentry.
 *
 * Matched case-insensitively against the whole key, so `email` and `Email` are
 * caught and `emailSent` is not — the latter is a count, and losing it would
 * cost the reason somebody added the log line.
 */
export const REDACTED_KEYS: readonly string[] = [
  // Contact
  'email',
  'phone',
  'msisdn',
  'recipient',
  // Identity
  'idnumber',
  'identitynumber',
  'sanumber',
  // Banking
  'accountnumber',
  'accountno',
  'branchcode',
  'iban',
  // Credentials
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
  'servicekey',
  'authorization',
  'cookie',
  'signature',
  'otp',
]

const REDACTED_SET = new Set(REDACTED_KEYS)

/** What replaces a redacted value. Recognisable in a log, not mistaken for data. */
export const REDACTED = '[redacted]'

/**
 * How deep to walk before giving up.
 *
 * A nested structure this deep in log metadata is a mistake in its own right,
 * and walking it forever is how a logger becomes the slowest thing in a
 * request. Below the limit the value is dropped rather than passed through
 * unredacted — an unreadable log is recoverable, a leaked one is not.
 */
const MAX_DEPTH = 6

export function isRedactedKey(key: string): boolean {
  return REDACTED_SET.has(key.toLowerCase())
}

/**
 * A copy of `value` with sensitive fields replaced.
 *
 * Never mutates its input: the caller's object is very often the same one the
 * request is still using, and a logger that quietly empties a field would turn
 * an observability concern into a correctness bug.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[too deep]'

  // A cycle in metadata is unusual and entirely possible — a Prisma row with a
  // back-reference, a request object. Marking it beats recursing forever.
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen))
  }

  // Dates, Buffers and the like are values, not bags of fields. Walking them
  // produces noise; leaving them alone keeps the log readable.
  if (value instanceof Date || ArrayBuffer.isView(value)) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [
      key,
      isRedactedKey(key) ? REDACTED : redact(v, depth + 1, seen),
    ]),
  )
}
