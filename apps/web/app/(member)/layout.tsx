import { redirect } from 'next/navigation'
import { signOut } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { MemberAppShell } from '@/components/layout/MemberAppShell'
import { AppFooter } from '@/components/layout/AppFooter'
import { getUnreadInboxCount } from '@/services/inbox.service'
import { env } from '@/lib/env'
import { logger } from '@xxm/observability'

async function SignOutForm() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/login' })
      }}
    >
      <button
        type="submit"
        className="text-xs text-white/55 hover:text-white transition-colors outline-none focus-visible:underline"
      >
        Sign out
      </button>
    </form>
  )
}

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session?.user) redirect('/login')

  // Best-effort: an unavailable count must never take the whole app shell down
  // with it — the member simply sees no badge.
  const unreadCount = await getUnreadInboxCount(session.user.id).catch((err) => {
    logger.error('Failed to read unread inbox count', {
      error: err instanceof Error ? err.message : String(err),
    })
    return 0
  })

  const isAdmin = session.user.roles?.includes('ADMIN')
  const name = session.user.name ?? ''
  const initials =
    name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

  return (
    <MemberAppShell
      userName={name}
      userInitials={initials}
      isAdmin={!!isAdmin}
      signOutSlot={<SignOutForm />}
      footerSlot={<AppFooter />}
      adminUrl={env.NEXT_PUBLIC_ADMIN_URL}
      unreadCount={unreadCount}
    >
      {children}
    </MemberAppShell>
  )
}
