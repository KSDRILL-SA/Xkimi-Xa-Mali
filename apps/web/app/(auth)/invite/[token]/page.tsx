import type { Metadata } from 'next'
import { validateInviteCode } from '@/services/invite.service'
import { isAppError } from '@/lib/errors'
import { InviteRegisterForm } from '@/components/auth/InviteRegisterForm'
import { InviteErrorView } from '@/components/auth/InviteErrorView'

export const metadata: Metadata = { title: 'Join Xkimm Xa Mali' }

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  let invite: Awaited<ReturnType<typeof validateInviteCode>> | null = null
  let errorCode: string | null = null

  try {
    invite = await validateInviteCode(token)
  } catch (err) {
    errorCode = isAppError(err) ? err.code : 'SYS_500'
  }

  if (errorCode || !invite) {
    return (
      <>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-xxm-green-900">Invite link</h1>
          <p className="text-sm text-gray-500 mt-1">Join Xkimm Xa Mali</p>
        </div>
        <InviteErrorView code={errorCode ?? 'SYS_500'} />
      </>
    )
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-xxm-green-900">Create your account</h1>
        <p className="text-sm text-gray-500 mt-1">Complete your registration to join Xkimm Xa Mali</p>
      </div>
      <InviteRegisterForm invite={invite} inviteCode={token} />
    </>
  )
}
