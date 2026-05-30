import { put, getDownloadUrl } from '@vercel/blob'
import type { IStorageProvider, StorageUploadOptions, StorageUploadResult } from './types'

export const vercelBlobStorage: IStorageProvider = {
  upload: async (
    path: string,
    data: Buffer | Uint8Array,
    options: StorageUploadOptions,
  ): Promise<StorageUploadResult> => {
    const blob = await put(path, data, {
      access: options.access ?? 'public',
      contentType: options.contentType,
      addRandomSuffix: options.addRandomSuffix ?? false,
    })

    const signedUrl = getDownloadUrl(blob.url)
    return { url: blob.url, signedUrl }
  },
}
