import { describe, it, expect, vi, beforeEach } from 'vitest'

// `vi.mock` factories are hoisted above module scope, so anything they close
// over has to be hoisted too.
const { KEY } = vi.hoisted(() => ({ KEY: 'a'.repeat(64) }))
const OTHER_KEY = 'b'.repeat(64)

vi.mock('@/lib/env', () => ({ env: { ENCRYPTION_KEY: KEY } }))

const logged = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('@xxm/observability', () => ({ logger: logged }))

import { encrypt, decrypt, tryDecrypt, maskStoredSecret, UNREADABLE_SECRET } from '@/lib/encryption'

beforeEach(() => logged.error.mockClear())

/**
 * A stored secret can stop being readable without anybody doing anything wrong —
 * a rotated key, a row written by a different environment, a fixture. Before
 * this, `decrypt` threw and an unguarded throw in a server component took the
 * page with it: one unreadable bank account broke contributions, mandates,
 * profile and the statement PDF at the same time.
 */
describe('a value that cannot be read no longer takes the page down', () => {
  it('round-trips a value written with the current key', () => {
    expect(decrypt(encrypt('1234567890'))).toBe('1234567890')
    expect(tryDecrypt(encrypt('1234567890'))).toBe('1234567890')
  })

  it('returns null instead of throwing when the key no longer matches', () => {
    // Encrypted under a different key, exactly as a row written before a
    // rotation would be.
    const foreign = encryptWith(OTHER_KEY, '1234567890')
    expect(() => decrypt(foreign)).toThrow()
    expect(tryDecrypt(foreign)).toBeNull()
  })

  it('returns null for a value that was never ciphertext at all', () => {
    // What a test mock's `enc:${v}` looks like if it reaches a real database.
    expect(tryDecrypt('enc:1')).toBeNull()
    expect(tryDecrypt('')).toBeNull()
    expect(tryDecrypt('not base64 at all !!')).toBeNull()
  })

  it('masks readable values and degrades unreadable ones', () => {
    expect(maskStoredSecret(encrypt('1234567890'))).toBe('******7890')
    expect(maskStoredSecret('enc:1')).toBe(UNREADABLE_SECRET)
  })
})

describe('the failure is reported, because it is never routine', () => {
  it('logs at error level with the context needed to find the row', () => {
    maskStoredSecret('enc:1', { field: 'bankAccount.accountNumber', bankAccountId: 'bank_1' })

    expect(logged.error).toHaveBeenCalledTimes(1)
    const [message, meta] = logged.error.mock.calls[0]
    expect(message).toMatch(/could not be decrypted/i)
    expect(meta).toMatchObject({ field: 'bankAccount.accountNumber', bankAccountId: 'bank_1' })
    expect(meta.reason).toBeTruthy()
  })

  it('never logs the ciphertext or any recovered plaintext', () => {
    const ciphertext = encryptWith(OTHER_KEY, '1234567890')
    tryDecrypt(ciphertext, { bankAccountId: 'bank_1' })

    const serialised = JSON.stringify(logged.error.mock.calls[0])
    expect(serialised).not.toContain(ciphertext)
    expect(serialised).not.toContain('1234567890')
  })

  it('says nothing when the value reads cleanly', () => {
    maskStoredSecret(encrypt('1234567890'))
    expect(logged.error).not.toHaveBeenCalled()
  })
})

/** Encrypt with an arbitrary key, to produce a row the app cannot read. */
function encryptWith(hexKey: string, plaintext: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCipheriv, randomBytes } = require('crypto')
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')
}
