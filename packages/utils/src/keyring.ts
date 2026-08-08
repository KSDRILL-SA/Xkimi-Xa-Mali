import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/**
 * Encryption keys that can be replaced without losing what was written under the
 * old one.
 *
 * The problem this exists to solve: a single `ENCRYPTION_KEY` that "must never
 * change" is not a policy, it is the absence of one. One leak exposes every
 * bank and ID number ever stored, and the only remedy — swapping the key —
 * makes all of it unreadable at the same moment.
 *
 * Two things make replacement possible:
 *
 * 1. **New ciphertext says which key wrote it.** The envelope carries a version
 *    and a key id, so a value can be attributed without trying keys against it.
 * 2. **Old keys stay available for reading.** A rotation adds a key rather than
 *    substituting one; the retired key keeps decrypting until the re-encrypt
 *    backfill has moved every row across, and only then is it removed.
 *
 * This module is deliberately free of application imports — no env, no logger,
 * no database. It is used both by the running app and by the operational script
 * that performs the backfill, and those must agree byte for byte about the
 * envelope. Anything that could differ between the two is kept out.
 *
 * Nothing here logs or throws with key material or ciphertext in the message.
 */

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const KEY_LENGTH_BYTES = 32
const KEY_LENGTH_HEX = KEY_LENGTH_BYTES * 2

/**
 * The envelope version written today.
 *
 * `v1.<keyId>.<base64(iv ‖ authTag ‖ ciphertext)>`
 *
 * The `.` delimiter is safe because base64 never produces one and key ids are
 * restricted below. Values written before versioning exist — bare
 * `base64(iv ‖ authTag ‖ ciphertext)` with nothing to say which key made them —
 * and are still read; see {@link decryptEnvelope}.
 */
export const ENVELOPE_VERSION = 'v1'

/**
 * Key ids appear inside the envelope, so they cannot contain the delimiter.
 * Kept to an unambiguous alphabet rather than merely excluding `.`, because an
 * id is also typed into environment variables and read off deploy dashboards.
 */
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export interface Keyring {
  /** The id stamped into everything written from now on. */
  readonly activeId: string
  /** The key new ciphertext is written with. */
  readonly activeKey: Buffer
  /**
   * Retired keys, by id — read-only. Never used for a new write, which is what
   * makes "the backfill is finished" a statement that can be checked rather
   * than hoped for.
   */
  readonly previousKeys: ReadonlyMap<string, Buffer>
}

export interface KeyringInput {
  /** 64 hex characters. The key new ciphertext is written with. */
  key: string
  /** Identifies {@link KeyringInput.key} in the envelope. Defaults to `1`. */
  keyId?: string
  /**
   * Retired keys as `id:hex` pairs, comma separated —
   * `1:aaaa…,2:bbbb…`. Decryption only.
   */
  previousKeys?: string
}

/** A parsed envelope. `keyId` is null for values written before versioning. */
interface ParsedEnvelope {
  keyId: string | null
  payload: Buffer
}

/**
 * Build a keyring from configuration, rejecting anything ambiguous.
 *
 * Every check here is a mistake that would otherwise be discovered at the worst
 * possible time — mid-rotation, with half the rows moved. A duplicated id means
 * two different keys claim the same envelopes. An id reused for the active key
 * means new writes are indistinguishable from old ones. The same key material
 * listed twice means somebody believes they rotated and did not.
 */
export function buildKeyring({ key, keyId = '1', previousKeys }: KeyringInput): Keyring {
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error(
      `Encryption key id must be 1-32 characters of A-Z, a-z, 0-9, _ or -; got "${keyId}"`,
    )
  }

  const activeKey = parseKey(key, `active key (id "${keyId}")`)
  const previous = new Map<string, Buffer>()

  for (const entry of splitEntries(previousKeys)) {
    const separator = entry.indexOf(':')
    if (separator === -1) {
      throw new Error(`Previous encryption key "${entry}" is not in "id:hex" form`)
    }

    const id = entry.slice(0, separator).trim()
    const material = entry.slice(separator + 1).trim()

    if (!KEY_ID_PATTERN.test(id)) {
      throw new Error(
        `Previous encryption key id must be 1-32 characters of A-Z, a-z, 0-9, _ or -; got "${id}"`,
      )
    }
    if (id === keyId) {
      throw new Error(
        `Previous encryption key id "${id}" is also the active key id. ` +
          'A rotation adds a new id, it does not reuse the old one.',
      )
    }
    if (previous.has(id)) {
      throw new Error(`Previous encryption key id "${id}" is listed more than once`)
    }

    const parsed = parseKey(material, `previous key "${id}"`)
    if (parsed.equals(activeKey)) {
      throw new Error(
        `Previous encryption key "${id}" holds the same key material as the active key. ` +
          'Nothing was rotated.',
      )
    }
    for (const [otherId, other] of previous) {
      if (parsed.equals(other)) {
        throw new Error(
          `Previous encryption keys "${otherId}" and "${id}" hold the same key material`,
        )
      }
    }

    previous.set(id, parsed)
  }

  return { activeId: keyId, activeKey, previousKeys: previous }
}

/** Encrypt under the active key, stamping the envelope with its id. */
export function encryptWithKeyring(keyring: Keyring, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, keyring.activeKey, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')

  return `${ENVELOPE_VERSION}.${keyring.activeId}.${payload}`
}

/**
 * Decrypt a value written under any key on the ring. Throws if none can read it.
 *
 * A versioned envelope names its key, so exactly one is tried and a failure
 * means the value is damaged or the key is wrong — not that another key might
 * work. An unversioned value predates the id and cannot name anything, so every
 * key is tried in turn. That is safe rather than sloppy: GCM authenticates, so a
 * wrong key fails the tag instead of returning plausible nonsense.
 */
export function decryptEnvelope(keyring: Keyring, envelope: string): string {
  const { keyId, payload } = parseEnvelope(envelope)

  if (keyId !== null) {
    const key = findKey(keyring, keyId)
    if (!key) {
      throw new Error(
        `No encryption key with id "${keyId}" is configured. ` +
          'It was retired before every row written under it was re-encrypted.',
      )
    }
    return open(key, payload)
  }

  // Written before the envelope carried a key id.
  const candidates = [keyring.activeKey, ...keyring.previousKeys.values()]
  for (const key of candidates) {
    try {
      return open(key, payload)
    } catch {
      continue
    }
  }

  throw new Error(
    `No configured encryption key could read an unversioned value ` +
      `(tried ${candidates.length}: active plus ${keyring.previousKeys.size} previous)`,
  )
}

/**
 * Which key wrote this value, or null if it predates versioning.
 *
 * The backfill uses this to tell "already moved" from "still to move" without
 * decrypting anything.
 */
export function envelopeKeyId(envelope: string): string | null {
  return parseEnvelope(envelope).keyId
}

/** True when the value is already written under the ring's active key. */
export function isWrittenUnderActiveKey(keyring: Keyring, envelope: string): boolean {
  try {
    return envelopeKeyId(envelope) === keyring.activeId
  } catch {
    return false
  }
}

function findKey(keyring: Keyring, keyId: string): Buffer | undefined {
  return keyId === keyring.activeId ? keyring.activeKey : keyring.previousKeys.get(keyId)
}

function parseKey(hex: string, label: string): Buffer {
  const trimmed = hex.trim()
  if (trimmed.length !== KEY_LENGTH_HEX || !/^[0-9a-fA-F]+$/.test(trimmed)) {
    // Length only. The value itself must never reach a log or an error report.
    throw new Error(
      `Encryption ${label} must be ${KEY_LENGTH_HEX} hexadecimal characters; got ${trimmed.length}`,
    )
  }
  return Buffer.from(trimmed, 'hex')
}

function splitEntries(list: string | undefined): string[] {
  if (!list) return []
  return list
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function parseEnvelope(envelope: string): ParsedEnvelope {
  const parts = envelope.split('.')

  if (parts.length === 3 && parts[0]?.startsWith('v')) {
    const version = parts[0]
    const keyId = parts[1] ?? ''
    const payload = parts[2] ?? ''
    if (version !== ENVELOPE_VERSION) {
      throw new Error(
        `Unsupported encryption envelope version "${version}". ` +
          'The value was written by a newer release than the one reading it.',
      )
    }
    if (!KEY_ID_PATTERN.test(keyId)) {
      throw new Error(`Encryption envelope carries a malformed key id "${keyId}"`)
    }
    return { keyId, payload: decodePayload(payload) }
  }

  if (parts.length !== 1) {
    throw new Error('Value is not a recognisable encryption envelope')
  }

  return { keyId: null, payload: decodePayload(envelope) }
}

function decodePayload(payload: string): Buffer {
  const buf = Buffer.from(payload, 'base64')
  // Exactly IV+TAG is legitimate: it is the encryption of an empty string. The
  // bound is `<`, not `<=`.
  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    // Base64 decoding never fails — it discards what it does not understand —
    // so a short buffer is how "this was never ciphertext" actually presents.
    throw new Error('Value is too short to be encrypted data')
  }
  return buf
}

function open(key: Buffer, payload: Buffer): string {
  const iv = payload.subarray(0, IV_LENGTH)
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
  const encrypted = payload.subarray(IV_LENGTH + TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
}
