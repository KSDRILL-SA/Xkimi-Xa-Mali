import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Link from 'next/link'
import { signOut } from '@/lib/auth'

async function SignOutButton() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/auth/login' })
      }}
    >
      <button
        type="submit"
        className="text-sm text-white/70 hover:text-white transition-colors"
      >
        Sign out
      </button>
    </form>
  )
}

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const isAdmin = session.user.roles?.includes('ADMIN')

  return (
    <div className="min-h-dvh flex flex-col bg-xxm-green-50">
      {/* Top nav */}
      <header className="h-14 bg-xxm-green shadow-sm flex items-center px-4 md:px-6 gap-4">
        <Link href="/dashboard" className="flex items-center gap-2 mr-auto">
          <span className="w-7 h-7 rounded-lg bg-xxm-gold/20 border border-xxm-gold/40 flex items-center justify-center">
            <span className="text-sm font-black text-xxm-gold">X</span>
          </span>
          <span className="text-white font-semibold text-sm hidden sm:block">Xkimm Xa Mali</span>
        </Link>

        <nav className="flex items-center gap-1">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/dashboard/contributions">Contributions</NavLink>
          <NavLink href="/dashboard/mandates">Mandates</NavLink>
          <NavLink href="/dashboard/goals">Goals</NavLink>
          <NavLink href="/dashboard/profile">Profile</NavLink>
          {isAdmin && <NavLink href="/admin">Admin</NavLink>}
        </nav>

        <div className="flex items-center gap-3 ml-2">
          <span className="text-white/70 text-sm hidden md:block">
            {session.user.name}
          </span>
          <SignOutButton />
        </div>
      </header>

      {/* Page */}
      <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">{children}</main>
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
    >
      {children}
    </Link>
  )
}
