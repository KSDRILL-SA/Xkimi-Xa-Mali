import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { clientIpFromHeaders } from '@xxm/utils/client-ip'
import { authRatelimit } from '@/lib/redis'
import { validateInviteCode } from '@/services/invite.service'
import { isAppError } from '@/lib/errors'
import { InviteRegisterForm } from '@/components/auth/InviteRegisterForm'
import { InviteErrorView } from '@/components/auth/InviteErrorView'
import { AuthHeading } from '@/components/auth/AuthHeading'
import { AuthCard } from '@/components/auth/AuthCard'

export const metadata: Metadata = { title: 'Join the Foundation' }

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  let invite: Awaited<ReturnType<typeof validateInviteCode>> | null = null
  let errorCode: string | null = null

  // Throttled here as well as on the API route.
  //
  // `POST /api/v1/auth/invitations/validate` runs the same `validateInviteCode`
  // behind `authRatelimit`. This page ran it behind nothing, and the middleware
  // waves `/invite/` through as a public page — so the route was throttled and
  // the page beside it was an open oracle for the identical check. Two paths to
  // one check with one of them hardened is the shape this repository keeps
  // finding, and it does not stop being that shape because the codes are long.
  //
  // The same limiter and the same key as the route, so the two share one budget
  // rather than handing a caller two.
  const ip = clientIpFromHeaders(await headers()) ?? 'unknown'
  const { success } = await authRatelimit.limit(ip)

  if (!success) {
    errorCode = 'SYS_005'
  } else {
    try {
      invite = await validateInviteCode(token)
    } catch (err) {
      errorCode = isAppError(err) ? err.code : 'SYS_500'
    }
  }

  if (errorCode || !invite) {
    return (
      <AuthCard>
        <AuthHeading title="Invite link" subtitle="Join Xkimi Xa Mali Foundation" centered />
        <InviteErrorView code={errorCode ?? 'SYS_500'} />
      </AuthCard>
    )
  }

  return (
    <AuthCard>
      <AuthHeading title="Create your account" subtitle="Complete your registration to join Xkimi Xa Mali Foundation" />
      <InviteRegisterForm invite={invite} inviteCode={token} />
    </AuthCard>
  )
}
