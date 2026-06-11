import { put, getDownloadUrl } from '@vercel/blob'
import { withRetry } from '@/lib/resilience'
import type { IStorageProvider, StorageUploadOptions, StorageUploadResult } from './types'

export const vercelBlobStorage: IStorageProvider = {
  upload: async (
    path: string,
    data: Buffer | Uint8Array,
    options: StorageUploadOptions,
  ): Promise<StorageUploadResult> => {
    const buffer = data instanceof Buffer ? data : Buffer.from(data)

    // Local-dev fallback: when Vercel Blob isn't configured, return a
    // self-contained data: URL so uploads (signatures, etc.) work end-to-end
    // without a cloud storage account instead of throwing "No token found".
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      const dataUrl = `data:${options.contentType ?? 'application/octet-stream'};base64,${buffer.toString('base64')}`
      return { url: dataUrl, signedUrl: dataUrl }
    }

    // Path-idempotent (addRandomSuffix:false) → safe to retry through a
    // transient blob/network hiccup so statement & signature uploads don't fail.
    const blob = await withRetry(
      () => put(path, buffer as Parameters<typeof put>[1], {
        access: (options.access ?? 'public') as 'public',
        contentType: options.contentType,
        addRandomSuffix: options.addRandomSuffix ?? false,
      }),
      { retries: 3, baseDelayMs: 250 },
    )

    const signedUrl = getDownloadUrl(blob.url)
    return { url: blob.url, signedUrl }
  },
}
