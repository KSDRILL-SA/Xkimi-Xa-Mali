import { describe, it, expect } from 'vitest'
import { createCipheriv, randomBytes } from 'node:crypto'
import {
  buildKeyring,
  encryptWithKeyring,
  decryptEnvelope,
  envelopeKeyId,
  isWrittenUnderActiveKey,
  ENVELOPE_VERSION,
} from '../src/keyring'

/**
 * The property being defended: a key can be replaced without the data written
 * under the old one becoming unreadable, and "the replacement is finished" is
 * something that can be checked rather than assumed.
 *
 * These are bank account numbers and ID numbers. Getting rotation wrong in one
 * direction leaks them; getting it wrong in the other destroys them.
 */

const KEY_A = 'a'.repeat(64)
const KEY_B = 'b'.repeat(64)
const KEY_C = 'c'.repeat(64)
const SECRET = '1234567890'

describe('a value says which key wrote it', () => {
  it('stamps the version and the active key id into the envelope', () => {
    const ring = buildKeyring({ key: KEY_A, keyId: '1' })
    const envelope = encryptWithKeyring(ring, SECRET)

    expect(envelope.startsWith(`${ENVELOPE_VERSION}.1.`)).toBe(true)
    expect(envelopeKeyId(envelope)).toBe('1')
    expect(isWrittenUnderActiveKey(ring, envelope)).toBe(true)
  })

  it('defaults the id to 1, so an unconfigured deployment is still versioned', () => {
    expect(envelopeKeyId(encryptWithKeyring(buildKeyring({ key: KEY_A }), SECRET))).toBe('1')
  })

  it('produces different ciphertext each time — the IV is per value', () => {
    const ring = buildKeyring({ key: KEY_A })
    expect(encryptWithKeyring(ring, SECRET)).not.toBe(encryptWithKeyring(ring, SECRET))
  })

  it('round-trips values that are empty, long, or not ASCII', () => {
    const ring = buildKeyring({ key: KEY_A })
    for (const value of ['', 'x'.repeat(5000), 'Mpho Ndlovu — ünïcode ✓']) {
      expect(decryptEnvelope(ring, encryptWithKeyring(ring, value))).toBe(value)
    }
  })
})

describe('a rotation keeps what the retired key wrote', () => {
  it('reads a value written under the previous key, and writes new ones under the new key', () => {
    const before = buildKeyring({ key: KEY_A, keyId: '1' })
    const written = encryptWithKeyring(before, SECRET)

    // The rotation: B becomes active as id 2, A stays for reading as id 1.
    const after = buildKeyring({ key: KEY_B, keyId: '2', previousKeys: `1:${KEY_A}` })

    expect(decryptEnvelope(after, written)).toBe(SECRET)
    expect(envelopeKeyId(encryptWithKeyring(after, SECRET))).toBe('2')
    expect(isWrittenUnderActiveKey(after, written)).toBe(false)
  })

  it('survives two rotations, reading values from every generation', () => {
    const gen1 = buildKeyring({ key: KEY_A, keyId: '1' })
    const fromGen1 = encryptWithKeyring(gen1, 'first')

    const gen2 = buildKeyring({ key: KEY_B, keyId: '2', previousKeys: `1:${KEY_A}` })
    const fromGen2 = encryptWithKeyring(gen2, 'second')

    const gen3 = buildKeyring({
      key: KEY_C,
      keyId: '3',
      previousKeys: `1:${KEY_A}, 2:${KEY_B}`,
    })

    expect(decryptEnvelope(gen3, fromGen1)).toBe('first')
    expect(decryptEnvelope(gen3, fromGen2)).toBe('second')
    expect(decryptEnvelope(gen3, encryptWithKeyring(gen3, 'third'))).toBe('third')
  })

  it('tolerates the whitespace and trailing commas a hand-edited env var picks up', () => {
    const ring = buildKeyring({ key: KEY_C, keyId: '3', previousKeys: ` 1:${KEY_A} , 2:${KEY_B}, ` })
    expect(ring.previousKeys.size).toBe(2)
  })

  it('refuses a value once its key is gone, and says why', () => {
    const written = encryptWithKeyring(buildKeyring({ key: KEY_A, keyId: '1' }), SECRET)
    // The previous key removed too early — the mistake this whole design exists
    // to make loud instead of silent.
    const stripped = buildKeyring({ key: KEY_B, keyId: '2' })

    expect(() => decryptEnvelope(stripped, written)).toThrow(/no encryption key with id "1"/i)
  })

  it('does not fall back to another key when the envelope names one', () => {
    // A value stamped id 2 but written under a different key is damaged, not
    // merely mismatched. Trying every key would paper over that.
    const ring = buildKeyring({ key: KEY_B, keyId: '2', previousKeys: `1:${KEY_A}` })
    const mislabelled = `${ENVELOPE_VERSION}.2.${rawPayload(KEY_A, SECRET)}`

    expect(() => decryptEnvelope(ring, mislabelled)).toThrow()
  })
})

describe('values written before any of this existed', () => {
  // Every row in the database today: bare base64(iv ‖ tag ‖ ciphertext), with
  // nothing to say which key produced it.
  it('reads an unversioned value under the active key', () => {
    const ring = buildKeyring({ key: KEY_A })
    expect(decryptEnvelope(ring, rawPayload(KEY_A, SECRET))).toBe(SECRET)
  })

  it('reads an unversioned value under a previous key, because it cannot name one', () => {
    const ring = buildKeyring({ key: KEY_B, keyId: '2', previousKeys: `1:${KEY_A}` })
    expect(decryptEnvelope(ring, rawPayload(KEY_A, SECRET))).toBe(SECRET)
  })

  it('reports it as unversioned rather than guessing an id', () => {
    expect(envelopeKeyId(rawPayload(KEY_A, SECRET))).toBeNull()
    expect(isWrittenUnderActiveKey(buildKeyring({ key: KEY_A }), rawPayload(KEY_A, SECRET))).toBe(
      false,
    )
  })

  it('fails when no key on the ring can read it', () => {
    const ring = buildKeyring({ key: KEY_B, keyId: '2' })
    expect(() => decryptEnvelope(ring, rawPayload(KEY_A, SECRET))).toThrow(/unversioned/i)
  })
})

describe('things that were never ciphertext', () => {
  const ring = buildKeyring({ key: KEY_A })

  it('rejects them instead of returning something plausible', () => {
    // `enc:1` is what a test mock looks like if it ever reaches a real database.
    for (const value of ['', 'enc:1', 'not base64 at all !!', 'v1.1.', 'a.b.c.d']) {
      expect(() => decryptEnvelope(ring, value)).toThrow()
    }
  })

  it('rejects an envelope version it does not understand', () => {
    expect(() => decryptEnvelope(ring, `v2.1.${rawPayload(KEY_A, SECRET)}`)).toThrow(
      /unsupported encryption envelope version/i,
    )
  })

  it('rejects a tampered payload — GCM authenticates, so a flipped bit fails', () => {
    const envelope = encryptWithKeyring(ring, SECRET)
    const [version, id, payload] = envelope.split('.')
    const bytes = Buffer.from(payload, 'base64')
    bytes[bytes.length - 1] ^= 0xff

    expect(() => decryptEnvelope(ring, `${version}.${id}.${bytes.toString('base64')}`)).toThrow()
  })
})

describe('configuration that would only be discovered mid-rotation', () => {
  it('rejects a key that is not 32 bytes of hex', () => {
    expect(() => buildKeyring({ key: 'a'.repeat(63) })).toThrow(/64 hexadecimal characters/i)
    expect(() => buildKeyring({ key: 'z'.repeat(64) })).toThrow(/64 hexadecimal characters/i)
    expect(() => buildKeyring({ key: KEY_A, keyId: '2', previousKeys: '1:short' })).toThrow(
      /previous key "1".*64 hexadecimal/i,
    )
  })

  it('rejects a previous key that reuses the active id — new writes would be indistinguishable', () => {
    expect(() => buildKeyring({ key: KEY_B, keyId: '1', previousKeys: `1:${KEY_A}` })).toThrow(
      /also the active key id/i,
    )
  })

  it('rejects a duplicated previous id — two keys claiming the same envelopes', () => {
    expect(() =>
      buildKeyring({ key: KEY_C, keyId: '3', previousKeys: `1:${KEY_A},1:${KEY_B}` }),
    ).toThrow(/listed more than once/i)
  })

  it('rejects the same key material under two ids — nothing was actually rotated', () => {
    expect(() => buildKeyring({ key: KEY_A, keyId: '2', previousKeys: `1:${KEY_A}` })).toThrow(
      /nothing was rotated/i,
    )
    expect(() =>
      buildKeyring({ key: KEY_C, keyId: '3', previousKeys: `1:${KEY_A},2:${KEY_A}` }),
    ).toThrow(/same key material/i)
  })

  it('rejects an id that would break the envelope delimiter', () => {
    expect(() => buildKeyring({ key: KEY_A, keyId: '1.2' })).toThrow(/key id must be/i)
    expect(() => buildKeyring({ key: KEY_A, keyId: '' })).toThrow(/key id must be/i)
    expect(() => buildKeyring({ key: KEY_B, previousKeys: `a.b:${KEY_A}` })).toThrow(/key id must be/i)
  })

  it('rejects a previous key that is not in id:hex form', () => {
    expect(() => buildKeyring({ key: KEY_A, previousKeys: KEY_B })).toThrow(/"id:hex" form/i)
  })

  it('treats an absent previous-key list as no previous keys, not as an error', () => {
    expect(buildKeyring({ key: KEY_A, previousKeys: undefined }).previousKeys.size).toBe(0)
    expect(buildKeyring({ key: KEY_A, previousKeys: '' }).previousKeys.size).toBe(0)
    expect(buildKeyring({ key: KEY_A, previousKeys: ' , ' }).previousKeys.size).toBe(0)
  })
})

describe('no key material or plaintext escapes in an error', () => {
  it('reports lengths and ids, never the values themselves', () => {
    const attempts = [
      () => buildKeyring({ key: 'a'.repeat(63) }),
      () => buildKeyring({ key: KEY_A, previousKeys: `1:${'b'.repeat(63)}` }),
      () => buildKeyring({ key: KEY_A, keyId: '2', previousKeys: `1:${KEY_A}` }),
      () => decryptEnvelope(buildKeyring({ key: KEY_B }), rawPayload(KEY_A, SECRET)),
    ]

    for (const attempt of attempts) {
      let message = ''
      try {
        attempt()
      } catch (err) {
        message = err instanceof Error ? err.message : String(err)
      }

      expect(message).not.toBe('')
      expect(message).not.toContain(KEY_A)
      expect(message).not.toContain(KEY_B)
      expect(message).not.toContain(SECRET)
    }
  })
})

/** The pre-rotation format: base64(iv ‖ authTag ‖ ciphertext), no version, no id. */
function rawPayload(hexKey: string, plaintext: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}
