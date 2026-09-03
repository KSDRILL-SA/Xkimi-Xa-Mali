import { put } from '@vercel/blob'

/**
 * What a proof of payment is allowed to be, and how it is recognised.
 *
 * `sniff` reads the file's own leading bytes. The browser-declared MIME type is
 * client-supplied and so is the filename, and neither is evidence of anything —
 * a `.pdf` extension on a zip is a rename, not a conversion. Every format here
 * announces itself in its first few bytes, so that is what gets asked.
 *
 * Word documents are deliberately absent. No bank issues one, they are trivially
 * editable so they are the weakest evidence a proof could be, and as a zip
 * container carrying macros they are the least pleasant thing to accept and
 * store. Every real proof of payment is a bank PDF or a picture of one.
 */
const ALLOWED: ReadonlyArray<{
  ext: string
  contentType: string
  sniff: (b: Buffer) => boolean
}> = [
  // %PDF-
  { ext: 'pdf', contentType: 'application/pdf', sniff: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  // \x89PNG\r\n\x1a\n
  { ext: 'png', contentType: 'image/png', sniff: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  // JPEG SOI
  { ext: 'jpg', contentType: 'image/jpeg', sniff: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  // RIFF....WEBP
  {
    ext: 'webp',
    contentType: 'image/webp',
    sniff: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  // ....ftyp<brand>, where the brand is one of HEIF's. What an iPhone produces
  // by default, and so the commonest thing anyone will actually upload from a
  // phone — leaving it out would reject most real attempts.
  {
    ext: 'heic',
    contentType: 'image/heic',
    sniff: (b) =>
      b.subarray(4, 8).toString('latin1') === 'ftyp' &&
      ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'mif1', 'msf1'].includes(
        b.subarray(8, 12).toString('latin1'),
      ),
  },
]

/**
 * 4 MB, and the ceiling is the platform's, not a preference.
 *
 * The upload rides a server action, which on Vercel is a serverless function,
 * and a function's request body is capped at about 4.5 MB before any of this
 * code runs. A larger limit here would not accept a larger file — it would move
 * the rejection to a platform 413 with no message, so the person uploading gets
 * a broken page instead of "that file is too big". Raising this without moving
 * the upload off the server action (a direct-to-blob client upload) makes the
 * failure worse, not the limit higher.
 *
 * It fits what proofs actually are: a bank PDF is well under 1 MB, a screenshot
 * a few hundred KB, and a phone photo one to three. The refusal message names
 * the way out for the rare full-resolution camera JPEG.
 */
export const MAX_PROOF_BYTES = 4 * 1024 * 1024

/** The formats, in the words the person uploading would use. */
export const PROOF_FORMATS = 'PDF, PNG, JPEG, WebP or HEIC'

/** What the file input should offer, so the picker filters before we do. */
export const PROOF_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/*'

export class PaymentProofError extends Error {
  constructor(message: string) { super(message) }
}

/**
 * Persist a proof of payment and return a reference to it.
 *
 * Mirrors `outcome-storage.ts` — same adapter, same local fallback — so this
 * repository keeps one story about how it stores an uploaded file rather than
 * three that drift.
 *
 * - Configured (`BLOB_READ_WRITE_TOKEN`): uploads **privately** and returns the
 *   pathname. A proof of payment shows a bank account number, a name and often
 *   a balance; `addRandomSuffix` makes a path unguessable, which is not the
 *   same as private. Served through the media routes, which check that a
 *   transaction row claims the reference before returning any bytes.
 * - Local development: a self-contained base64 `data:` URL, so the whole flow
 *   works end to end without cloud storage.
 *
 * The stored path carries no member id and no transaction id. The reference
 * travels in a URL query string when the file is viewed, and a path that names
 * who it belongs to would put that in browser history and any proxy log.
 */
export async function storePaymentProof(
  file: { buffer: Buffer; contentType: string; filename?: string },
): Promise<{ pathname: string; contentType: string }> {
  if (file.buffer.byteLength === 0) {
    throw new PaymentProofError('That file is empty. Attach the proof of payment itself.')
  }
  if (file.buffer.byteLength > MAX_PROOF_BYTES) {
    throw new PaymentProofError(
      `Proof of payment must be ${Math.floor(MAX_PROOF_BYTES / (1024 * 1024))} MB or smaller. ` +
        'A bank proof of payment or a screenshot is well under that — a full-resolution camera photo may not be.',
    )
  }

  // The file's own bytes decide, not what the browser called it.
  const format = ALLOWED.find((f) => f.sniff(file.buffer))
  if (!format) {
    throw new PaymentProofError(
      `That file is not a ${PROOF_FORMATS}. If it came from banking software, export it as a PDF or take a screenshot.`,
    )
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`payment-proofs/proof.${format.ext}`, file.buffer, {
      access: 'private',
      contentType: format.contentType,
      // Every proof is a distinct record of a distinct payment. Overwriting one
      // would be the quiet deletion of evidence about money, so a new path each
      // time and never a replacement.
      addRandomSuffix: true,
      allowOverwrite: false,
    })
    return { pathname: blob.pathname, contentType: format.contentType }
  }

  return {
    pathname: `data:${format.contentType};base64,${file.buffer.toString('base64')}`,
    contentType: format.contentType,
  }
}
