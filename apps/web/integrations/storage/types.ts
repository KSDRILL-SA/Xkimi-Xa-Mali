export type StorageUploadResult = {
  url: string
  signedUrl: string
}

export type StorageUploadOptions = {
  contentType: string
  access?: 'public' | 'private'
  addRandomSuffix?: boolean
}

export interface IStorageProvider {
  upload(path: string, data: Buffer | Uint8Array, options: StorageUploadOptions): Promise<StorageUploadResult>
}
