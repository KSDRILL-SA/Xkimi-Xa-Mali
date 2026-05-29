'use client'

import { AppHeader } from './AppHeader'
import { ScrollNav, type NavItem } from './ScrollNav'
import { AppFooter } from './AppFooter'
import { ToastProvider } from '@xxm/ui'
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
} from 'lucide-react'

const adminNav: NavItem[] = [
  { href: '/',              label: 'Overview',     icon: LayoutDashboard, exact: true },
  { href: '/members',       label: 'Members',      icon: Users },
  { href: '/contributions', label: 'Contributions',icon: Wallet },
  { href: '/mandates',      label: 'Mandates',     icon: CalendarCheck },
  { href: '/goals',         label: 'Goals',        icon: Target },
  { href: '/notifications', label: 'Broadcast',    icon: Megaphone },
  { href: '/invitations',   label: 'Invitations',  icon: UserPlus },
  { href: '/reports',       label: 'Reports',      icon: BarChart3 },
  { href: '/audit',         label: 'Audit',        icon: ShieldCheck },
]

interface AdminAppShellProps {
  children: React.ReactNode
  userName: string
  userInitials: string
  signOutSlot: React.ReactNode
}

export function AdminAppShell({ children, userName, userInitials, signOutSlot }: AdminAppShellProps) {
  return (
    <ToastProvider>
      <div className="min-h-dvh flex flex-col bg-xxm-champagne">
        <AppHeader userName={userName} userInitials={userInitials} signOutSlot={signOutSlot} />
        <ScrollNav items={adminNav} />
        <main id="main-content" className="flex-1 p-4 md:p-6 max-w-screen-xl w-full mx-auto animate-fade-in-up">
          {children}
        </main>
        <AppFooter />
      </div>
    </ToastProvider>
  )
}
