import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import { logger } from '@xxm/observability'
import { env } from './env'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex')
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const key = getKey()
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, IV_LENGTH)
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH)

  const key = getKey()
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}

export function maskAccountNumber(accountNumber: string): string {
  return accountNumber.slice(-4).padStart(accountNumber.length, '*')
}

/** Stands in for a masked value whose ciphertext could not be read. */
export const UNREADABLE_SECRET = 'unavailable'

/**
 * Decrypt, or null if the stored value cannot be read.
 *
 * A value at rest can become undecryptable for reasons that have nothing to do
 * with the member looking at it: the key was rotated and the old one is gone, a
 * row was written by something holding a different key, or the column was
 * populated by a fixture. `decrypt` throws in all of those cases, and an
 * unguarded throw inside a server component takes the whole page down — so one
 * unreadable bank account was enough to break contributions, mandates, profile
 * and the statement PDF at once.
 *
 * Use this wherever the plaintext is only being *shown*. Where the plaintext is
 * acted on — submitting an account number to the payment gateway — keep calling
 * `decrypt` directly and let it throw: a debit must never be attempted against a
 * placeholder.
 *
 * The failure is logged at error level because it is never routine; `context`
 * should identify the row so it can be found and re-captured. Neither the
 * ciphertext nor any recovered plaintext is logged.
 */
export function tryDecrypt(
  ciphertext: string,
  context: Record<string, unknown> = {},
): string | null {
  try {
    return decrypt(ciphertext)
  } catch (err) {
    logger.error('Stored value could not be decrypted', {
      ...context,
      reason: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

/**
 * Mask an encrypted secret for display, degrading to {@link UNREADABLE_SECRET}
 * rather than throwing. See {@link tryDecrypt} for when this is the wrong tool.
 */
export function maskStoredSecret(
  ciphertext: string,
  context: Record<string, unknown> = {},
): string {
  const plain = tryDecrypt(ciphertext, context)
  return plain === null ? UNREADABLE_SECRET : maskAccountNumber(plain)
}
