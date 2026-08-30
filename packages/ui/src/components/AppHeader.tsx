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
  /** Unread messages waiting behind the bell. 0 or undefined shows no badge. */
  unreadCount?: number
  showSkipLink?: boolean
  fixedHeight?: boolean
}

/** Counts above this are shown as "9+" so the badge never distorts the bell. */
const MAX_BADGE_COUNT = 9

export function AppHeader({
  userName,
  userInitials = '?',
  signOutSlot,
  homeHref = '/dashboard',
  subtitle = 'Contributing · Growing · Securing',
  showAdminBadge = false,
  showBell = false,
  bellHref = '/dashboard/notifications',
  unreadCount = 0,
  showSkipLink = false,
  fixedHeight = true,
}: AppHeaderProps) {
  const [atTop, setAtTop] = useState(true)

  useEffect(() => {
    // Read in a rAF and only set state when the value actually flips.
    //
    // This previously called `setAtTop(window.scrollY === 0)` directly on
    // every scroll event. Two costs, both paid continuously while scrolling:
    // reading `scrollY` in the event handler forces a synchronous layout
    // (a "layout thrash"), and passing a fresh boolean to `setState` on every
    // event asks React to re-render this header — which is `sticky`, so it
    // owns a compositing layer the whole page is drawn against — dozens of
    // times a second, when the value only ever changes at one pixel.
    //
    // On a phone that shows up as tearing/flicker that gets worse the further
    // you scroll, and it is worst in "desktop site" mode, where the phone
    // renders at full desktop width so the layer is larger and every
    // `sm:`-and-up style is live. React bails out of a re-render when the
    // state value is identical, but the layout read happens regardless — so
    // the guard below is what actually removes the per-event cost.
    let frame = 0
    let last = true
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const next = window.scrollY <= 0
        if (next !== last) {
          last = next
          setAtTop(next)
        }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 bg-xxm-green border-b transition-shadow duration-300 ${
        atTop ? 'border-transparent shadow-none' : 'border-white/10 shadow-xxm'
      }`}
      // `translateZ(0)` promotes this to its own compositing layer up front.
      // A sticky element is composited anyway once it starts sticking; doing
      // it eagerly stops the browser promoting/demoting it mid-scroll, which
      // is itself a source of visible tearing on mobile GPUs.
      style={{
        ...(fixedHeight ? { height: 'var(--header-h)' } : {}),
        transform: 'translateZ(0)',
      }}
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
            <span className="font-bold text-white text-sm tracking-wide truncate">Xkimi Xa Mali Foundation</span>
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
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : 'Notifications'
              }
              className="relative w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold"
            >
              <Bell size={17} aria-hidden />
              {unreadCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-xxm-gold text-xxm-green-900 text-[10px] font-black leading-none flex items-center justify-center ring-2 ring-xxm-green"
                >
                  {unreadCount > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : unreadCount}
                </span>
              )}
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
