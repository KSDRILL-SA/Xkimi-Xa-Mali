import { createHash } from 'crypto'
import type { AdminSignature, Prisma } from '@prisma/client'
import { signatureRepo } from '@/repositories/signature.repository'
import { runTransaction } from '@/repositories/contribution.repository'
import { storageProvider } from '@/integrations/storage'
import { assertAdmin } from '@/lib/authorization'
import { AdminConflictError, ExternalServiceError, NoSignatureError, SignatureLockError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'

const SIGNATURE_LOCK_DAYS = 90
const LOCK_DURATION_MS = SIGNATURE_LOCK_DAYS * 24 * 60 * 60 * 1000

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeSignature(signature: AdminSignature) {
  return {
    id: signature.id,
    displayName: signature.displayName,
    isActive: signature.isActive,
    nextChangeAllowedAt: signature.nextChangeAllowedAt.toISOString(),
    canChangeNow: signature.nextChangeAllowedAt.getTime() <= Date.now(),
    createdAt: signature.createdAt.toISOString(),
    updatedAt: signature.updatedAt.toISOString(),
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/** The active signature record for an admin, or null if they haven't set one up. */
export async function getActiveSignature(adminId: string): Promise<AdminSignature | null> {
  return signatureRepo.findByAdmin(adminId)
}

/** Public-facing signature metadata for the admin settings page (no blob URL). */
export async function getSignatureMetadata(adminId: string, roles: string[]) {
  assertAdmin(roles)
  const signature = await signatureRepo.findByAdmin(adminId)
  return signature ? serializeSignature(signature) : null
}

/** Whether (and when) an admin may next change their signature. */
export async function getLockStatus(adminId: string, roles: string[]) {
  assertAdmin(roles)
  const signature = await signatureRepo.findByAdmin(adminId)
  if (!signature) return { canChange: true, nextChangeAllowedAt: null }
  return {
    canChange: signature.nextChangeAllowedAt.getTime() <= Date.now(),
    nextChangeAllowedAt: signature.nextChangeAllowedAt.toISOString(),
  }
}

/** An admin's signature change history, most recent first. */
export async function getSignatureHistory(adminId: string, roles: string[]) {
  assertAdmin(roles)
  const history = await signatureRepo.findHistory(adminId)
  return history.map((entry) => ({
    id: entry.id,
    signatureUrl: entry.signatureUrl,
    replacedAt: entry.replacedAt.toISOString(),
  }))
}

// ─── Document generation guard ──────────────────────────────────────────────

/** The institutional signature embedded in generated documents — throws if none configured yet. */
export async function verifySignatureExists(): Promise<AdminSignature> {
  const signature = await signatureRepo.findActiveSystem()
  if (!signature) throw new NoSignatureError()
  return signature
}

/**
 * Read a signature PNG from storage and return it as a base64 data URI for
 * embedding in a generated PDF.
 *
 * This was `fetch(signatureUrl)` against a public blob URL, which is the reason
 * signatures had to be world-readable in the first place: the document
 * generator was an anonymous HTTP client, so the only way it could see the
 * image was for anybody to be able to. Going through the storage provider means
 * it reads with the store's credentials instead, and the object can be private.
 *
 * The argument is a pathname now. A legacy row holding an absolute URL, or a
 * local `data:` URL, still resolves — see the adapter — so an old signature
 * keeps producing a statement rather than failing at the moment a member asks
 * for one.
 */
export async function embedSignatureInPdf(signatureRef: string): Promise<string> {
  try {
    const { buffer } = await storageProvider.download(signatureRef)
    return `data:image/png;base64,${buffer.toString('base64')}`
  } catch (err) {
    throw new ExternalServiceError(
      'Vercel Blob',
      `Failed to read signature (${err instanceof Error ? err.message : String(err)})`,
    )
  }
}

// ─── Signature management ───────────────────────────────────────────────────

/** Upload an admin's first signature. */
export async function createSignature(
  adminId: string,
  roles: string[],
  pngBuffer: Buffer,
  displayName: string,
): Promise<AdminSignature> {
  assertAdmin(roles)

  const existing = await signatureRepo.findByAdmin(adminId)
  if (existing) throw new AdminConflictError('Signature already exists — use update instead')

  const signatureHash = createHash('sha256').update(pngBuffer).digest('hex')
  const path = `signatures/${adminId}/${Date.now()}.png`
  const { pathname } = await storageProvider.upload(path, pngBuffer, {
    // An admin's handwritten signature. Public storage put it at a URL derivable
    // from the admin's id, permanently and without authentication.
    access: 'private',
    contentType: 'image/png',
    addRandomSuffix: false,
  })

  const signature = await signatureRepo.create({
    adminId,
    signatureUrl: pathname,
    signatureHash,
    displayName,
    isActive: true,
    nextChangeAllowedAt: new Date(Date.now() + LOCK_DURATION_MS),
  })

  await writeAuditLog({
    userId: adminId,
    action: 'SIGNATURE_CREATED',
    entity: 'AdminSignature',
    entityId: signature.id,
    payload: { displayName } as Prisma.InputJsonValue,
  })

  return signature
}

/** Replace an admin's signature once the 90-day lock window has elapsed. */
export async function updateSignature(
  adminId: string,
  roles: string[],
  pngBuffer: Buffer,
  displayName: string,
): Promise<AdminSignature> {
  assertAdmin(roles)

  const existing = await signatureRepo.findByAdmin(adminId)
  if (!existing) throw new NoSignatureError()

  if (existing.nextChangeAllowedAt.getTime() > Date.now()) {
    throw new SignatureLockError(existing.nextChangeAllowedAt)
  }

  const signatureHash = createHash('sha256').update(pngBuffer).digest('hex')
  const path = `signatures/${adminId}/${Date.now()}.png`
  const { pathname } = await storageProvider.upload(path, pngBuffer, {
    // An admin's handwritten signature. Public storage put it at a URL derivable
    // from the admin's id, permanently and without authentication.
    access: 'private',
    contentType: 'image/png',
    addRandomSuffix: false,
  })

  const signature = await runTransaction(async (tx) => {
    await signatureRepo.createHistory({
      adminId,
      signatureUrl: existing.signatureUrl,
      signatureHash: existing.signatureHash,
      replacedById: adminId,
    }, tx)

    return signatureRepo.update(adminId, {
      signatureUrl: pathname,
      signatureHash,
      displayName,
      nextChangeAllowedAt: new Date(Date.now() + LOCK_DURATION_MS),
    }, tx)
  })

  await writeAuditLog({
    userId: adminId,
    action: 'SIGNATURE_UPDATED',
    entity: 'AdminSignature',
    entityId: signature.id,
    payload: { displayName } as Prisma.InputJsonValue,
  })

  return signature
}
