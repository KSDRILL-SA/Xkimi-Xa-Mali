'use client'

import { AppHeader } from '@/components/layout/AppHeader'
import { ScrollNav, type NavItem } from '@/components/layout/ScrollNav'
import { AppFooter } from '@/components/layout/AppFooter'
import { ToastProvider } from '@/components/ui'
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
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/members', label: 'Members', icon: Users },
  { href: '/admin/contributions', label: 'Contributions', icon: Wallet },
  { href: '/admin/mandates', label: 'Mandates', icon: CalendarCheck },
  { href: '/admin/goals', label: 'Goals', icon: Target },
  { href: '/admin/notifications', label: 'Broadcast', icon: Megaphone },
  { href: '/admin/invitations', label: 'Invitations', icon: UserPlus },
  { href: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { href: '/admin/audit', label: 'Audit', icon: ShieldCheck },
  { href: '/dashboard', label: 'Member View', icon: ArrowLeft },
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
        <AppHeader userName={userName} userInitials={userInitials} isAdmin signOutSlot={signOutSlot} />
        <ScrollNav items={adminNav} variant="admin" />
        <main id="main-content" className="flex-1 p-4 md:p-6 max-w-screen-xl w-full mx-auto animate-fade-in-up">
          {children}
        </main>
        <AppFooter />
      </div>
    </ToastProvider>
  )
}
