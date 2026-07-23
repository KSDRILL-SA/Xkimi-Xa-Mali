import { put } from '@vercel/blob'

/**
 * Persist a signature PNG and return a URL that renders the image.
 *
 * - Production / configured: uploads to Vercel Blob (BLOB_READ_WRITE_TOKEN set)
 *   and returns the public blob URL.
 * - Local development (no token): returns a self-contained base64 `data:` URL.
 *   This lets the signature feature work end-to-end without cloud storage, and
 *   avoids Next.js dev not serving files written to `public/` after startup.
 */
export async function storeSignaturePng(path: string, pngBuffer: Buffer): Promise<string> {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(path, pngBuffer, {
      access: 'public',
      contentType: 'image/png',
      addRandomSuffix: false,
      // Signatures are addressed by a stable path and may be re-captured. Since
      // v1 the SDK throws on an existing pathname unless overwriting is allowed.
      allowOverwrite: true,
    })
    return blob.url
  }

  return `data:image/png;base64,${pngBuffer.toString('base64')}`
}
