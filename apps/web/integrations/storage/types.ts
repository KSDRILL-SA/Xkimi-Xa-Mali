export type StorageUploadResult = {
  /**
   * The blob's pathname — what to persist.
   *
   * Deliberately not the absolute URL. A stored URL is a standing decision that
   * the object is reachable by anyone holding the string, and it survives every
   * later attempt to make the object private. The pathname says where the bytes
   * are and nothing about who may read them, which leaves the access decision
   * where it belongs: at the moment of serving, with a session in hand.
   */
  pathname: string
  /**
   * The absolute URL, for public objects only.
   *
   * `null` for private ones — there is no URL that renders them, and returning a
   * plausible-looking string that 401s would be worse than returning nothing.
   */
  url: string | null
}

export type StorageUploadOptions = {
  contentType: string
  /**
   * Defaults to `'private'`.
   *
   * It used to default to `'public'`, which meant every upload written without
   * an explicit choice was world-readable by URL. That is the wrong direction
   * for a default to fail in: forgetting to think about it should produce the
   * safe outcome, not the exposed one.
   */
  access?: 'public' | 'private'
  addRandomSuffix?: boolean
}

export type StorageObject = {
  buffer: Buffer
  contentType: string
}

export interface IStorageProvider {
  upload(path: string, data: Buffer | Uint8Array, options: StorageUploadOptions): Promise<StorageUploadResult>
  /**
   * Read an object back by pathname, with the store's credentials.
   *
   * Needed because a private blob has no URL a `fetch` can follow. Callers that
   * previously did `fetch(signatureUrl)` — the PDF generator, notably — go
   * through here instead.
   *
   * Accepts a legacy absolute URL or a `data:` URL too, so rows written before
   * this change keep working rather than turning into a broken document.
   */
  download(pathnameOrUrl: string): Promise<StorageObject>
}
