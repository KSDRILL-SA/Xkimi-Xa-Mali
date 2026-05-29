import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { AdminAppShell } from '@/components/layout/AdminAppShell'
import { formatInitials } from '@xxm/utils'

async function SignOutForm() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/login' })
      }}
    >
      <button type="submit" className="text-xs text-white/55 hover:text-white transition-colors outline-none focus-visible:underline">
        Sign out
      </button>
    </form>
  )
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const name = session.user.name ?? ''

  return (
    <AdminAppShell
      userName={name}
      userInitials={formatInitials(name)}
      signOutSlot={<SignOutForm />}
    >
      {children}
    </AdminAppShell>
  )
}
