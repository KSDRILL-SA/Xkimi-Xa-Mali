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
 * Persist a Goal outcome's proof and return a URL that renders it.
 *
 * Mirrors `signature-storage.ts`, deliberately: same adapter, same local
 * fallback, so there is one story about how this repository stores an uploaded
 * file rather than two that drift.
 *
 * - Configured (`BLOB_READ_WRITE_TOKEN`): uploads to Vercel Blob, returns the
 *   public URL.
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

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`goal-outcomes/${goalId}.${ext}`, file.buffer, {
      access: 'public',
      contentType: file.contentType,
      addRandomSuffix: true,
      allowOverwrite: false,
    })
    return blob.url
  }

  return `data:${file.contentType};base64,${file.buffer.toString('base64')}`
}
