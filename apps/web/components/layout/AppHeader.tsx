import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { Bell, ChevronRight } from 'lucide-react'

interface AppHeaderProps {
  userName?: string | null
  userInitials?: string
  isAdmin?: boolean
  signOutSlot: React.ReactNode
}

export function AppHeader({ userName, userInitials = '?', isAdmin, signOutSlot }: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-40 bg-xxm-green border-b border-white/10 shadow-xxm"
      style={{ height: 'var(--header-h)' }}
    >
      <div className="h-full flex items-center gap-3 px-4 md:px-6 max-w-screen-2xl mx-auto">
        {/* Brand */}
        <Link
          href={isAdmin ? '/admin' : '/dashboard'}
          className="flex items-center gap-2.5 mr-auto min-w-0 group outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-lg p-1 -m-1"
          aria-label="Go to dashboard"
        >
          <XmmLogo size={36} className="shrink-0 group-hover:scale-105 transition-transform duration-200" />

          <span className="flex flex-col leading-none min-w-0 hidden sm:flex">
            <span className="font-bold text-white text-sm tracking-wide truncate">
              Xkimm Xa Mali
            </span>
            <span className="text-white/45 text-[10px] tracking-widest uppercase mt-0.5">
              Contributing · Growing · Securing
            </span>
          </span>

          {isAdmin && (
            <span className="hidden md:flex items-center gap-1 ml-1 text-xxm-gold/70 text-xs font-medium">
              <ChevronRight size={12} aria-hidden />
              Admin
            </span>
          )}
        </Link>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <Link
            href="/dashboard/notifications"
            aria-label="Notifications"
            className="relative w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold"
          >
            <Bell size={17} aria-hidden />
          </Link>

          {/* User avatar */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/15 ml-1">
            <div
              className="w-8 h-8 rounded-full bg-xxm-gold/20 border border-xxm-gold/40 flex items-center justify-center shrink-0"
              aria-hidden
            >
              <span className="text-xs font-bold text-xxm-gold">{userInitials}</span>
            </div>

            <span className="text-white/70 text-sm hidden md:block max-w-[120px] truncate">
              {userName}
            </span>

            {signOutSlot}
          </div>
        </div>
      </div>
    </header>
  )
}
