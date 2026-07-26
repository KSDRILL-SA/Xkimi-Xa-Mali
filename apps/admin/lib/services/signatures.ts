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
export async function createSignature(
  adminId: string, adminRoles: string[], pngBuffer: Buffer, displayName: string,
) {
  assertAdmin(adminRoles)

  const existing = await db.adminSignature.findUnique({ where: { adminId } })
  if (existing) throw new AdminConflictError('Signature already exists — use update instead')

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
