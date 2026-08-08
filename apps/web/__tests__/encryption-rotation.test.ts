import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The keyring itself is proved in `packages/utils/__tests__/keyring.test.ts`.
 * What is proved here is the wiring: that the three environment variables an
 * operator actually edits during a rotation reach it, and that the app notices
 * when they change.
 *
 * The memoisation is the part worth testing. The keyring is cached so that a
 * rotation is not re-parsed on every bank account read — and a cache that does
 * not notice new configuration is how a rotation appears to have been applied
 * while the process keeps using the old key.
 */

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)

// `vi.mock` factories are hoisted, so the object they close over must be too.
const { mockEnv } = vi.hoisted(() => ({
  mockEnv: {
    ENCRYPTION_KEY: 'a'.repeat(64),
    ENCRYPTION_KEY_ID: undefined as string | undefined,
    ENCRYPTION_PREVIOUS_KEYS: undefined as string | undefined,
  },
}))
vi.mock('@/lib/env', () => ({ env: mockEnv }))
vi.mock('@xxm/observability', () => ({ logger: { error: vi.fn() } }))

import { encrypt, decrypt, tryDecrypt, maskStoredSecret, UNREADABLE_SECRET } from '@/lib/encryption'

/** Put the environment in the state an operator's dashboard would be in. */
function configure(key: string, keyId?: string, previousKeys?: string) {
  mockEnv.ENCRYPTION_KEY = key
  mockEnv.ENCRYPTION_KEY_ID = keyId
  mockEnv.ENCRYPTION_PREVIOUS_KEYS = previousKeys
}

beforeEach(() => configure(KEY_A))

describe('a deployment that has never rotated', () => {
  it('needs no new configuration and still writes a versioned value', () => {
    // ENCRYPTION_KEY_ID and ENCRYPTION_PREVIOUS_KEYS are unset, exactly as every
    // existing environment has them. Nothing has to be added for this to work.
    const stored = encrypt('6001015009087')

    expect(stored.startsWith('v1.1.')).toBe(true)
    expect(decrypt(stored)).toBe('6001015009087')
  })
})

describe('the three variables an operator edits during a rotation', () => {
  it('writes under the new key and still reads what the old one wrote', () => {
    const beforeRotation = encrypt('1234567890')

    // Step one of the runbook: add the new key, keep the old one for reading.
    configure(KEY_B, '2', `1:${KEY_A}`)

    expect(decrypt(beforeRotation)).toBe('1234567890')
    expect(encrypt('1234567890').startsWith('v1.2.')).toBe(true)
    expect(decrypt(encrypt('1234567890'))).toBe('1234567890')
  })

  it('stops reading the old key once it is removed from the previous list', () => {
    const beforeRotation = encrypt('1234567890')

    // Step three, run too early: the old key dropped before the backfill moved
    // every row. This is the failure the runbook exists to prevent.
    configure(KEY_B, '2')

    expect(() => decrypt(beforeRotation)).toThrow()
    // A member's page still renders; the value shows as unreadable instead.
    expect(tryDecrypt(beforeRotation)).toBeNull()
    expect(maskStoredSecret(beforeRotation)).toBe(UNREADABLE_SECRET)
  })

  it('refuses to start on configuration that cannot be a rotation', () => {
    configure(KEY_B, '1', `1:${KEY_A}`)
    expect(() => encrypt('1234567890')).toThrow(/also the active key id/i)

    configure(KEY_A, '2', `1:${KEY_A}`)
    expect(() => encrypt('1234567890')).toThrow(/nothing was rotated/i)
  })
})

describe('the cached keyring', () => {
  it('picks up a key change rather than serving the previous one', () => {
    const underA = encrypt('1234567890')
    expect(decrypt(underA)).toBe('1234567890')

    configure(KEY_B, '2', `1:${KEY_A}`)

    // If the cache ignored the change, this would still be stamped 1.
    expect(encrypt('1234567890').startsWith('v1.2.')).toBe(true)
    expect(decrypt(underA)).toBe('1234567890')
  })

  it('picks up a previous key being added without the active key changing', () => {
    const foreign = encryptUnder(KEY_B)
    expect(tryDecrypt(foreign)).toBeNull()

    configure(KEY_A, '1', `0:${KEY_B}`)

    expect(decrypt(foreign)).toBe('1234567890')
  })
})

/** A value written by another environment — versioned, under a key we may not hold. */
function encryptUnder(hexKey: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createCipheriv, randomBytes } = require('crypto')
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv)
  const enc = Buffer.concat([cipher.update('1234567890', 'utf8'), cipher.final()])
  return `v1.0.${Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')}`
}
