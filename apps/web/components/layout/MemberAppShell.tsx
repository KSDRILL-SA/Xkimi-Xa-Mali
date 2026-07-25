'use client'

import { AppHeader } from '@/components/layout/AppHeader'
import { ScrollNav, type NavItem } from '@/components/layout/ScrollNav'
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
  Trophy,
  Users,
} from 'lucide-react'

const memberNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/contributions', label: 'Contributions', icon: Wallet },
  { href: '/dashboard/mandates', label: 'Mandates', icon: CalendarCheck },
  { href: '/dashboard/goals', label: 'Goals', icon: Target },
  { href: '/dashboard/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { href: '/dashboard/statements', label: 'Statements', icon: FileText },
  { href: '/dashboard/badges', label: 'Badges', icon: Trophy },
  { href: '/dashboard/community', label: 'Community', icon: Users },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  { href: '/dashboard/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/dashboard/profile', label: 'Profile', icon: UserCircle },
]

interface MemberAppShellProps {
  children: React.ReactNode
  userName: string
  userInitials: string
  isAdmin: boolean
  signOutSlot: React.ReactNode
  footerSlot: React.ReactNode
  adminUrl: string
  /** Unread inbox messages, shown on the header bell. */
  unreadCount: number
}

export function MemberAppShell({
  children,
  userName,
  userInitials,
  isAdmin,
  signOutSlot,
  footerSlot,
  adminUrl,
  unreadCount,
}: MemberAppShellProps) {
  const nav: NavItem[] = isAdmin
    ? [...memberNav, { href: adminUrl, label: 'Admin', icon: ShieldCheck }]
    : memberNav

  return (
    <ToastProvider>
      <div className="min-h-dvh flex flex-col bg-xxm-champagne">
        <AppHeader
          userName={userName}
          userInitials={userInitials}
          signOutSlot={signOutSlot}
          showBell
          unreadCount={unreadCount}
          showSkipLink
        />
        <ScrollNav items={nav} variant="member" />
        <main id="main-content" className="flex-1 p-4 md:p-6 max-w-screen-xl w-full mx-auto animate-fade-in-up">
          {children}
        </main>
        {footerSlot}
      </div>
    </ToastProvider>
  )
}
