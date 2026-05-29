import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { AdminAppShell } from '@/components/layout/AdminAppShell'

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

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/dashboard')

  const name = session.user.name ?? ''
  const initials =
    name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

  return (
    <AdminAppShell userName={name} userInitials={initials} signOutSlot={<SignOutForm />}>
      {children}
    </AdminAppShell>
  )
}
