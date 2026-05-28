import { redirect } from 'next/navigation'
import { auth, signOut } from '@/lib/auth'
import { AppHeader } from '@/components/layout/AppHeader'
import { ScrollNav, type NavItem } from '@/components/layout/ScrollNav'
import { AppFooter } from '@/components/layout/AppFooter'
import { ToastProvider } from '@/components/ui/Toast'
import {
  LayoutDashboard,
  Wallet,
  CalendarCheck,
  Target,
  ArrowLeftRight,
  FileText,
  MessageCircle,
  UserCircle,
  Bell,
  ShieldCheck,
} from 'lucide-react'

const memberNav: NavItem[] = [
  { href: '/dashboard',              label: 'Dashboard',     icon: LayoutDashboard, exact: true },
  { href: '/dashboard/contributions',label: 'Contributions', icon: Wallet },
  { href: '/dashboard/mandates',     label: 'Mandates',      icon: CalendarCheck },
  { href: '/dashboard/goals',        label: 'Goals',         icon: Target },
  { href: '/dashboard/transactions', label: 'Transactions',  icon: ArrowLeftRight },
  { href: '/dashboard/statements',   label: 'Statements',    icon: FileText },
  { href: '/dashboard/notifications',label: 'Notifications', icon: Bell },
  { href: '/dashboard/whatsapp',     label: 'WhatsApp',      icon: MessageCircle },
  { href: '/dashboard/profile',      label: 'Profile',       icon: UserCircle },
]

async function SignOutForm() {
  return (
    <form
      action={async () => {
        'use server'
        await signOut({ redirectTo: '/auth/login' })
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
  const session = await auth()
  if (!session?.user) redirect('/auth/login')

  const isAdmin = session.user.roles?.includes('ADMIN')
  const name    = session.user.name ?? ''
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  const nav: NavItem[] = isAdmin
    ? [...memberNav, { href: '/admin', label: 'Admin', icon: ShieldCheck }]
    : memberNav

  return (
    <ToastProvider>
      <div className="min-h-dvh flex flex-col bg-xxm-champagne">
        <AppHeader
          userName={name}
          userInitials={initials}
          signOutSlot={<SignOutForm />}
        />

        <ScrollNav items={nav} variant="member" />

        <main className="flex-1 p-4 md:p-6 max-w-screen-xl w-full mx-auto animate-fade-in-up">
          {children}
        </main>

        <AppFooter />
      </div>
    </ToastProvider>
  )
}
