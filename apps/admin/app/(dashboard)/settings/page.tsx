import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  getSignatureMetadata,
  getLockStatus,
  getSignatureHistory,
  createSignature,
  updateSignature,
  SignatureLockError,
  AdminConflictError,
  AdminNotFoundError,
} from '@/lib/services'
import { Breadcrumb, PageHeader, Reveal, Alert } from '@xxm/ui'
import { SignaturePadCard } from './SignaturePadCard'

export const metadata: Metadata = { title: 'Settings' }

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'Please provide a signature image and a display name (3-120 characters).',
  locked: 'Your signature can only be changed once every 90 days.',
  conflict: 'A signature already exists — refresh the page and use update instead.',
  not_found: 'No signature on file — upload one first.',
  failed: 'Could not save your signature. Please try again, or use a smaller image.',
}

async function saveSignatureAction(fd: FormData) {
  'use server'
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const file = fd.get('signature')
  const displayName = (fd.get('displayName') as string | null)?.trim()
  const mode = fd.get('mode') as string

  if (
    !(file instanceof File) ||
    file.size === 0 ||
    !displayName ||
    displayName.length < 3 ||
    displayName.length > 120
  ) {
    redirect('/settings?error=invalid')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let errorCode: string | null = null

  try {
    if (mode === 'update') {
      await updateSignature(session.user.id, roles, buffer, displayName)
    } else {
      await createSignature(session.user.id, roles, buffer, displayName)
    }
  } catch (err) {
    if (err instanceof SignatureLockError) errorCode = 'locked'
    else if (err instanceof AdminConflictError) errorCode = 'conflict'
    else if (err instanceof AdminNotFoundError) errorCode = 'not_found'
    else {
      console.error('Signature save failed', err)
      errorCode = 'failed'
    }
  }

  revalidatePath('/settings')
  redirect(errorCode ? `/settings?error=${errorCode}` : '/settings?saved=1')
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const params = await searchParams
  const saved = params.saved === '1'
  const errorMessage = params.error ? ERROR_MESSAGES[params.error] : undefined

  const [signature, lockStatus, history] = await Promise.all([
    getSignatureMetadata(session.user.id, roles),
    getLockStatus(session.user.id, roles),
    getSignatureHistory(session.user.id, roles),
  ])

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Settings' }]} />
      <Reveal variant="up">
        <PageHeader title="Settings" subtitle="Manage your authorisation signature" />
      </Reveal>

      {saved && <Alert variant="success">Signature saved successfully.</Alert>}
      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      <Reveal variant="up" delay={100}>
        <SignaturePadCard
          signature={signature}
          lockStatus={lockStatus}
          history={history}
          saveAction={saveSignatureAction}
        />
      </Reveal>
    </div>
  )
}
