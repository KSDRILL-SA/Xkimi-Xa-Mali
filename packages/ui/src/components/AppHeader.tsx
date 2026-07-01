'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Bell, ChevronRight } from 'lucide-react'
import { XmmLogo } from './XmmLogo'

export interface AppHeaderProps {
  userName?: string | null
  userInitials?: string
  signOutSlot: React.ReactNode
  homeHref?: string
  subtitle?: string
  showAdminBadge?: boolean
  showBell?: boolean
  bellHref?: string
  showSkipLink?: boolean
  fixedHeight?: boolean
}

export function AppHeader({
  userName,
  userInitials = '?',
  signOutSlot,
  homeHref = '/dashboard',
  subtitle = 'Contributing · Growing · Securing',
  showAdminBadge = false,
  showBell = false,
  bellHref = '/dashboard/notifications',
  showSkipLink = false,
  fixedHeight = true,
}: AppHeaderProps) {
  const [atTop, setAtTop] = useState(true)

  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY === 0)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 bg-xxm-green border-b transition-shadow duration-300 ${
        atTop ? 'border-transparent shadow-none' : 'border-white/10 shadow-xxm'
      }`}
      style={fixedHeight ? { height: 'var(--header-h)' } : undefined}
    >
      {showSkipLink && (
        <a href="#main-content" className="skip-to-main">Skip to main content</a>
      )}

      <div className={`${fixedHeight ? 'h-full' : 'h-14'} flex items-center gap-3 px-4 md:px-6 max-w-screen-2xl mx-auto`}>
        <Link
          href={homeHref as Route}
          className="flex items-center gap-2.5 mr-auto min-w-0 group outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-lg p-1 -m-1"
          aria-label="Go to dashboard"
        >
          <XmmLogo size={fixedHeight ? 36 : 32} className="shrink-0 group-hover:scale-105 transition-transform duration-200" />
          <span className="flex flex-col leading-none min-w-0 hidden sm:flex">
            <span className="font-bold text-white text-sm tracking-wide truncate">Xkimm Xa Mali Foundation</span>
            <span className="text-white/45 text-[10px] tracking-widest uppercase mt-0.5">{subtitle}</span>
          </span>
          {showAdminBadge && (
            <span className="hidden md:flex items-center gap-1 ml-1 text-xxm-gold/70 text-xs font-medium">
              <ChevronRight size={12} aria-hidden />
              Admin
            </span>
          )}
        </Link>

        <div className="flex items-center gap-2">
          {showBell && (
            <Link
              href={bellHref as Route}
              aria-label="Notifications"
              className="relative w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold"
            >
              <Bell size={17} aria-hidden />
            </Link>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-white/15 ml-1">
            <div className="w-8 h-8 rounded-full bg-xxm-gold/20 border border-xxm-gold/40 flex items-center justify-center shrink-0" aria-hidden>
              <span className="text-xs font-bold text-xxm-gold">{userInitials}</span>
            </div>
            <span className="text-white/70 text-sm hidden md:block max-w-[120px] truncate">{userName}</span>
            {signOutSlot}
          </div>
        </div>
      </div>
    </header>
  )
}
