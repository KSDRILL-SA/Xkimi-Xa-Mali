import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Link from 'next/link'
import { signOut } from '@/lib/auth'

async function AdminSignOutButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/auth/login' })
      }}
    >
      <button type="submit" className="text-sm text-white/70 hover:text-white transition-colors">
        Sign out
      </button>
    </form>
  )
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/login')

  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/dashboard')

  return (
    <div className="min-h-dvh flex flex-col bg-gray-50">
      {/* Top nav */}
      <header className="h-14 bg-xxm-green shadow-sm flex items-center px-4 md:px-6 gap-4">
        <Link href="/admin" className="flex items-center gap-2 mr-auto">
          <span className="w-7 h-7 rounded-lg bg-xxm-gold/20 border border-xxm-gold/40 flex items-center justify-center">
            <span className="text-sm font-black text-xxm-gold">X</span>
          </span>
          <span className="text-white font-semibold text-sm hidden sm:block">Xkimm Xa Mali</span>
          <span className="text-xxm-gold/70 text-xs font-medium hidden sm:block">· Admin</span>
        </Link>

        <nav className="flex items-center gap-1 flex-wrap">
          <AdminNavLink href="/admin">Overview</AdminNavLink>
          <AdminNavLink href="/admin/members">Members</AdminNavLink>
          <AdminNavLink href="/admin/contributions">Contributions</AdminNavLink>
          <AdminNavLink href="/admin/mandates">Mandates</AdminNavLink>
          <AdminNavLink href="/admin/goals">Goals</AdminNavLink>
          <AdminNavLink href="/admin/notifications">Broadcast</AdminNavLink>
          <AdminNavLink href="/admin/reports">Reports</AdminNavLink>
          <AdminNavLink href="/admin/audit">Audit</AdminNavLink>
          <AdminNavLink href="/dashboard">Member View</AdminNavLink>
        </nav>

        <div className="flex items-center gap-3 ml-2">
          <span className="text-white/70 text-sm hidden md:block">{session.user.name}</span>
          <AdminSignOutButton />
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  )
}

function AdminNavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  )
}
