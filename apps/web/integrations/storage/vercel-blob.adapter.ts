import { put, get } from '@vercel/blob'
import { withRetry } from '@/lib/resilience'
import type {
  IStorageProvider,
  StorageObject,
  StorageUploadOptions,
  StorageUploadResult,
} from './types'

/**
 * Local-dev objects, held in memory.
 *
 * Without `BLOB_READ_WRITE_TOKEN` there is nowhere to put bytes, and the old
 * adapter returned a `data:` URL so the feature still worked end to end. That
 * is kept — a `data:` URL is self-contained and carries no access question at
 * all — but the bytes are also remembered here so `download` can answer for a
 * pathname the same way it will in production.
 */
const localObjects = new Map<string, StorageObject>()

/** `data:image/png;base64,…` → the bytes, without a network call. */
function readDataUrl(dataUrl: string): StorageObject | null {
  // `[\s\S]` rather than `.` with the `s` flag: this package targets an older
  // ES level than dotAll requires, and base64 of a real file contains newlines
  // often enough that `.` alone would silently truncate the payload.
  const match = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl)
  if (!match) return null
  return {
    contentType: match[1] ?? 'application/octet-stream',
    buffer: Buffer.from(match[2] ?? '', 'base64'),
  }
}

export const vercelBlobStorage: IStorageProvider = {
  upload: async (
    path: string,
    data: Buffer | Uint8Array,
    options: StorageUploadOptions,
  ): Promise<StorageUploadResult> => {
    const buffer = data instanceof Buffer ? data : Buffer.from(data)
    const contentType = options.contentType ?? 'application/octet-stream'

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      localObjects.set(path, { buffer, contentType })
      return {
        pathname: path,
        url: `data:${contentType};base64,${buffer.toString('base64')}`,
      }
    }

    // Private unless a caller asks otherwise, so an upload written without a
    // thought about access is not world-readable by URL.
    const access = options.access ?? 'private'

    // Path-idempotent (addRandomSuffix:false) → safe to retry through a
    // transient blob/network hiccup. allowOverwrite is required for that to
    // hold: since v1 the SDK throws when a pathname already exists, which would
    // make a retry fail after the first attempt had in fact stored the blob but
    // lost the response.
    const blob = await withRetry(
      () => put(path, buffer as Parameters<typeof put>[1], {
        access,
        contentType,
        addRandomSuffix: options.addRandomSuffix ?? false,
        allowOverwrite: true,
      }),
      { retries: 3, baseDelayMs: 250 },
    )

    return {
      pathname: blob.pathname,
      // A private blob has no URL that renders it. Returning one that 401s
      // would be worse than returning nothing, because it would look usable.
      url: access === 'public' ? blob.url : null,
    }
  },

  download: async (pathnameOrUrl: string): Promise<StorageObject> => {
    const asDataUrl = readDataUrl(pathnameOrUrl)
    if (asDataUrl) return asDataUrl

    const local = localObjects.get(pathnameOrUrl)
    if (local) return local

    // A legacy row holding an absolute public URL. Fetched directly rather than
    // rewritten, so a document generated from an old signature still renders
    // instead of failing at the moment somebody needs a statement.
    if (/^https?:\/\//.test(pathnameOrUrl)) {
      const res = await fetch(pathnameOrUrl)
      if (!res.ok) throw new Error(`Storage read failed (${res.status})`)
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      }
    }

    const result = await get(pathnameOrUrl, { access: 'private' })

    // `get` resolves to null when the object is not there, and to a 304 variant
    // with a null stream when the caller passed a conditional header. Neither
    // is bytes, and both would otherwise destructure into `undefined` and fail
    // somewhere less obvious than here.
    if (!result || result.statusCode !== 200) {
      throw new Error(`Storage object not found: ${pathnameOrUrl}`)
    }

    return {
      buffer: Buffer.from(await new Response(result.stream).arrayBuffer()),
      contentType: result.blob.contentType ?? 'application/octet-stream',
    }
  },
}
