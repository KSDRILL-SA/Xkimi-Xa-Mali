export type {
  IStorageProvider,
  StorageUploadResult,
  StorageUploadOptions,
} from './types'

export { vercelBlobStorage as storageProvider } from './vercel-blob.adapter'
