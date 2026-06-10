import type { Metadata } from 'next'
import { validateInviteCode } from '@/services/invite.service'
import { isAppError } from '@/lib/errors'
import { InviteRegisterForm } from '@/components/auth/InviteRegisterForm'
import { InviteErrorView } from '@/components/auth/InviteErrorView'
import { AuthHeading } from '@/components/auth/AuthHeading'

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
        <AuthHeading title="Invite link" subtitle="Join Xkimm Xa Mali" centered />
        <InviteErrorView code={errorCode ?? 'SYS_500'} />
      </>
    )
  }

  return (
    <>
      <AuthHeading title="Create your account" subtitle="Complete your registration to join Xkimm Xa Mali" />
      <InviteRegisterForm invite={invite} inviteCode={token} />
    </>
  )
}
