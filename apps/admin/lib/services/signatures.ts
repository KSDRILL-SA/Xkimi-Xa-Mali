import { type AdminSignature } from '@prisma/client'
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { storeSignaturePng } from '@/lib/signature-storage'
import { assertAdmin, writeAuditLog, AdminNotFoundError, AdminConflictError, SignatureLockError } from './shared'

// ─── Signature ────────────────────────────────────────────────────────────────

const SIGNATURE_LOCK_DAYS = 90
const SIGNATURE_LOCK_DURATION_MS = SIGNATURE_LOCK_DAYS * 24 * 60 * 60 * 1000

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

/** Current admin's signature metadata for the settings page (no blob URL). */
export async function getSignatureMetadata(adminId: string, adminRoles: string[]) {
  assertAdmin(adminRoles)
  const signature = await db.adminSignature.findUnique({ where: { adminId } })
  return signature ? serializeSignature(signature) : null
}

/** Whether (and when) the admin may next change their signature. */
export async function getLockStatus(adminId: string, adminRoles: string[]) {
  assertAdmin(adminRoles)
  const signature = await db.adminSignature.findUnique({ where: { adminId } })
  if (!signature) return { canChange: true, nextChangeAllowedAt: null }
  return {
    canChange: signature.nextChangeAllowedAt.getTime() <= Date.now(),
    nextChangeAllowedAt: signature.nextChangeAllowedAt.toISOString(),
  }
}

/** The admin's signature change history, most recent first. */
export async function getSignatureHistory(adminId: string, adminRoles: string[]) {
  assertAdmin(adminRoles)
  const history = await db.adminSignatureHistory.findMany({
    where: { adminId }, orderBy: { replacedAt: 'desc' },
  })
  return history.map((entry) => ({
    id: entry.id,
    signatureUrl: entry.signatureUrl,
    replacedAt: entry.replacedAt.toISOString(),
  }))
}

/** Upload the admin's first signature. */
/**
 * Refuse anything that is not a real PNG, and anything absurdly large.
 *
 * Nothing checked either. The storage path is named `.png` and the helper is
 * called `storeSignaturePng`, but the bytes were whatever the admin chose —
 * a JPEG, a PDF, a text file — stored under a PNG name and trusted.
 *
 * The blast radius is not this page. A signature is rendered into member
 * statements, so a file that is not an image does not fail here where somebody
 * would see it; it fails later, inside statement generation, for every member
 * asking for a statement. An admin uploading the wrong file would break a
 * member-facing document and have no reason to connect the two.
 *
 * Magic bytes rather than the browser's content-type, because that is a claim
 * made by the client and this is the one place the claim can be checked
 * against the thing itself.
 */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Generous for a signature — a scanned one runs to tens of kilobytes. */
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024

function assertUsableSignature(pngBuffer: Buffer): void {
  if (pngBuffer.length === 0) {
    throw new AdminConflictError('That file is empty. Upload a PNG image of your signature.')
  }
  if (pngBuffer.length > MAX_SIGNATURE_BYTES) {
    throw new AdminConflictError('That image is too large. Use a PNG under 2 MB.')
  }
  if (!pngBuffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new AdminConflictError(
      'That file is not a PNG. Signatures are rendered onto member statements, so the format has to be one those documents can draw.',
    )
  }
}

export async function createSignature(
  adminId: string, adminRoles: string[], pngBuffer: Buffer, displayName: string,
) {
  assertAdmin(adminRoles)

  const existing = await db.adminSignature.findUnique({ where: { adminId } })
  if (existing) throw new AdminConflictError('Signature already exists — use update instead')

  assertUsableSignature(pngBuffer)

  const signatureHash = createHash('sha256').update(pngBuffer).digest('hex')
  const path = `signatures/${adminId}/${Date.now()}.png`
  const signatureUrl = await storeSignaturePng(path, pngBuffer)

  const signature = await db.adminSignature.create({
    data: {
      adminId,
      signatureUrl,
      signatureHash,
      displayName,
      isActive: true,
      nextChangeAllowedAt: new Date(Date.now() + SIGNATURE_LOCK_DURATION_MS),
    },
  })

  await writeAuditLog({
    userId: adminId, action: 'SIGNATURE_CREATED', entity: 'AdminSignature', entityId: signature.id,
    payload: { displayName },
  })

  return serializeSignature(signature)
}

/** Replace the admin's signature once the 90-day lock window has elapsed. */
export async function updateSignature(
  adminId: string, adminRoles: string[], pngBuffer: Buffer, displayName: string,
) {
  assertAdmin(adminRoles)

  const existing = await db.adminSignature.findUnique({ where: { adminId } })
  if (!existing) throw new AdminNotFoundError('No signature on file — upload one first')
  if (existing.nextChangeAllowedAt.getTime() > Date.now()) {
    throw new SignatureLockError(existing.nextChangeAllowedAt)
  }

  assertUsableSignature(pngBuffer)

  const signatureHash = createHash('sha256').update(pngBuffer).digest('hex')
  const path = `signatures/${adminId}/${Date.now()}.png`
  const signatureUrl = await storeSignaturePng(path, pngBuffer)

  const signature = await db.$transaction(async (tx) => {
    await tx.adminSignatureHistory.create({
      data: {
        adminId,
        signatureUrl: existing.signatureUrl,
        signatureHash: existing.signatureHash,
        replacedById: adminId,
      },
    })

    return tx.adminSignature.update({
      where: { adminId },
      data: {
        signatureUrl,
        signatureHash,
        displayName,
        nextChangeAllowedAt: new Date(Date.now() + SIGNATURE_LOCK_DURATION_MS),
      },
    })
  })

  await writeAuditLog({
    userId: adminId, action: 'SIGNATURE_UPDATED', entity: 'AdminSignature', entityId: signature.id,
    payload: { displayName },
  })

  return serializeSignature(signature)
}
