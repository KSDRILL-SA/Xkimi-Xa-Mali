import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withApiHandler } from '@/lib/api-handler'
import { createSignature, getSignatureMetadata, updateSignature } from '@/services/signature.service'

const MAX_SIGNATURE_BYTES = 1_000_000

async function parseSignatureUpload(
  req: NextRequest,
): Promise<{ buffer: Buffer; displayName: string } | { error: NextResponse }> {
  const formData = await req.formData().catch(() => null)
  if (!formData) return { error: apiError('VAL_001', 'Expected multipart/form-data', 422) }

  const file = formData.get('signature')
  if (!(file instanceof File)) return { error: apiError('VAL_001', 'Signature image is required', 422) }
  if (file.type !== 'image/png') return { error: apiError('VAL_001', 'Signature must be a PNG image', 422) }
  if (file.size > MAX_SIGNATURE_BYTES) {
    return { error: apiError('VAL_001', 'Signature image must be under 1MB', 422) }
  }

  const displayName = (formData.get('displayName') as string | null)?.trim()
  if (!displayName || displayName.length < 3 || displayName.length > 120) {
    return { error: apiError('VAL_001', 'Display name must be between 3 and 120 characters', 422) }
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  return { buffer, displayName }
}

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const signature = await getSignatureMetadata(session.user.id, session.user.roles ?? [])
  return apiSuccess(signature)
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const parsed = await parseSignatureUpload(req)
  if ('error' in parsed) return parsed.error

  await createSignature(session.user.id, session.user.roles ?? [], parsed.buffer, parsed.displayName)
  const signature = await getSignatureMetadata(session.user.id, session.user.roles ?? [])
  return apiSuccess(signature, 201)
})

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const parsed = await parseSignatureUpload(req)
  if ('error' in parsed) return parsed.error

  await updateSignature(session.user.id, session.user.roles ?? [], parsed.buffer, parsed.displayName)
  const signature = await getSignatureMetadata(session.user.id, session.user.roles ?? [])
  return apiSuccess(signature)
})
