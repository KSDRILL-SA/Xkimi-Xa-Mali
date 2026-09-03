import { isBlobStorageAvailable } from '@xxm/utils/deployment'
import { put } from '@vercel/blob'

/** What a proof photo or receipt is allowed to be. */
const ALLOWED = new Map<string, string>([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['application/pdf', 'pdf'],
])

/** 8 MB. A phone photo of a receipt, not a video of the shop. */
export const MAX_PROOF_BYTES = 8 * 1024 * 1024

export class OutcomeProofError extends Error {
  constructor(message: string) { super(message) }
}

/**
 * Persist a Goal outcome's proof and return a reference to it.
 *
 * Mirrors `signature-storage.ts`, deliberately: same adapter, same local
 * fallback, so there is one story about how this repository stores an uploaded
 * file rather than two that drift.
 *
 * - On Vercel (`isBlobStorageAvailable`): uploads privately and returns the
 *   **pathname**. Authenticated by OIDC where the store is connected to the
 *   project, or by a read-write token where one is set — the SDK resolves
 *   whichever exists, which is why neither is named here.
 *   Serve it through `/api/media`, which requires an admin session and refuses
 *   a reference no row claims.
 * - Local development: returns a self-contained base64 `data:` URL, so the
 *   feature works end to end without cloud storage.
 *
 * Unlike a signature, a proof is never re-captured against the same path — each
 * one is a distinct record — so `addRandomSuffix` is on and overwriting is off.
 * An outcome that silently replaced an earlier one would be the quiet deletion
 * the guide rules out.
 */
export async function storeGoalOutcomeProof(
  goalId: string,
  file: { buffer: Buffer; contentType: string },
): Promise<string> {
  const ext = ALLOWED.get(file.contentType)
  if (!ext) {
    throw new OutcomeProofError('Proof must be a PNG, JPEG, WebP or PDF')
  }
  if (file.buffer.byteLength > MAX_PROOF_BYTES) {
    throw new OutcomeProofError('Proof must be 8 MB or smaller')
  }

  if (isBlobStorageAvailable()) {
    const blob = await put(`goal-outcomes/${goalId}.${ext}`, file.buffer, {
      // A proof is a receipt for money the collective spent — who was paid, for
      // how much, sometimes a member's name on an invoice. `addRandomSuffix`
      // made the path unguessable, which is not the same as private: the URL
      // was still permanent and unauthenticated, so anywhere it was ever pasted
      // it stayed readable by anyone, forever.
      access: 'private',
      contentType: file.contentType,
      addRandomSuffix: true,
      allowOverwrite: false,
    })
    return blob.pathname
  }

  return `data:${file.contentType};base64,${file.buffer.toString('base64')}`
}
