import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { AppHeader } from '@/components/layout/AppHeader'
import { ScrollNav, type NavItem } from '@/components/layout/ScrollNav'
import { AppFooter } from '@/components/layout/AppFooter'
import { ToastProvider } from '@/components/ui/Toast'
import {
  LayoutDashboard,
  Users,
  Wallet,
  CalendarCheck,
  Target,
  Megaphone,
  UserPlus,
  BarChart3,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react'

const adminNav: NavItem[] = [
  { href: '/admin',                  label: 'Overview',     icon: LayoutDashboard, exact: true },
  { href: '/admin/members',          label: 'Members',      icon: Users },
  { href: '/admin/contributions',    label: 'Contributions',icon: Wallet },
  { href: '/admin/mandates',         label: 'Mandates',     icon: CalendarCheck },
  { href: '/admin/goals',            label: 'Goals',        icon: Target },
  { href: '/admin/notifications',    label: 'Broadcast',    icon: Megaphone },
  { href: '/admin/invitations',      label: 'Invitations',  icon: UserPlus },
  { href: '/admin/reports',          label: 'Reports',      icon: BarChart3 },
  { href: '/admin/audit',            label: 'Audit',        icon: ShieldCheck },
  { href: '/dashboard',             label: 'Member View',  icon: ArrowLeft },
]

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
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  return (
    <ToastProvider>
      <div className="min-h-dvh flex flex-col bg-xxm-champagne">
        <AppHeader
          userName={name}
          userInitials={initials}
          isAdmin
          signOutSlot={<SignOutForm />}
        />

        <ScrollNav items={adminNav} variant="admin" />

        <main className="flex-1 p-4 md:p-6 max-w-screen-xl w-full mx-auto animate-fade-in-up">
          {children}
        </main>

        <AppFooter />
      </div>
    </ToastProvider>
  )
}
