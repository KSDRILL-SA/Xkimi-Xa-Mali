import { redirect } from 'next/navigation'
import { signOut } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { MemberAppShell } from '@/components/layout/MemberAppShell'
import { env } from '@/lib/env'

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
      whatsappGroupLink={env.WHATSAPP_GROUP_LINK}
      whatsappGroupName={env.WHATSAPP_GROUP_NAME}
    >
      {children}
    </MemberAppShell>
  )
}
