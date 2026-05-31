import { put, getDownloadUrl } from '@vercel/blob'
import type { IStorageProvider, StorageUploadOptions, StorageUploadResult } from './types'

export const vercelBlobStorage: IStorageProvider = {
  upload: async (
    path: string,
    data: Buffer | Uint8Array,
    options: StorageUploadOptions,
  ): Promise<StorageUploadResult> => {
    const body: BlobPart = data instanceof Buffer ? data : new Uint8Array(data)
    const blob = await put(path, body as Parameters<typeof put>[1], {
      access: (options.access ?? 'public') as 'public',
      contentType: options.contentType,
      addRandomSuffix: options.addRandomSuffix ?? false,
    })

    const signedUrl = getDownloadUrl(blob.url)
    return { url: blob.url, signedUrl }
  },
}
