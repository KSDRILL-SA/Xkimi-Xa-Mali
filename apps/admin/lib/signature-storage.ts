import { isBlobStorageAvailable } from '@xxm/utils/deployment'
import { put } from '@vercel/blob'

/**
 * Persist a signature PNG and return a reference to it.
 *
 * **The reference is a pathname, not a URL.** This used to store with
 * `access: 'public'` and `addRandomSuffix: false`, which put an admin's
 * handwritten signature at a permanent, unauthenticated URL derivable from the
 * admin's id — the same class of defect that member statements had before #312,
 * where the fix was to stop handing out a URL and serve the bytes through a
 * route that checks who is asking.
 *
 * A signature is the thing that makes a generated statement look authoritative.
 * Leaving one world-readable means anyone who can guess an id can lift it and
 * put it on a document the Foundation did not issue.
 *
 * - On Vercel (`isBlobStorageAvailable`): uploads privately, returns the
 *   pathname. Anything that renders it in a browser goes through `/api/media`,
 *   which requires an admin session and refuses a reference no row claims.
 * - Local development: returns a self-contained base64 `data:` URL, so the
 *   feature works end to end without cloud storage. The consumers accept both.
 */
export async function storeSignaturePng(path: string, pngBuffer: Buffer): Promise<string> {
  if (isBlobStorageAvailable()) {
    const blob = await put(path, pngBuffer, {
      access: 'private',
      contentType: 'image/png',
      addRandomSuffix: false,
      // Signatures are addressed by a stable path and may be re-captured. Since
      // v1 the SDK throws on an existing pathname unless overwriting is allowed.
      allowOverwrite: true,
    })
    return blob.pathname
  }

  return `data:image/png;base64,${pngBuffer.toString('base64')}`
}
