'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { XmmLogo } from '@xxm/ui'
import { ChevronRight } from 'lucide-react'

interface AppHeaderProps {
  userName?: string | null
  userInitials?: string
  signOutSlot: React.ReactNode
}

export function AppHeader({ userName, userInitials = '?', signOutSlot }: AppHeaderProps) {
  const [atTop, setAtTop] = useState(true)

  useEffect(() => {
    const onScroll = () => setAtTop(window.scrollY === 0)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-40 bg-xxm-green border-b border-white/10 shadow-xxm transition-opacity duration-500 ${
        atTop ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="h-14 flex items-center gap-3 px-4 md:px-6 max-w-screen-2xl mx-auto">
        <Link
          href="/"
          className="flex items-center gap-2.5 mr-auto min-w-0 group outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-lg p-1 -m-1"
          aria-label="Admin dashboard"
        >
          <XmmLogo size={32} className="shrink-0 group-hover:scale-105 transition-transform duration-200" />
          <span className="flex flex-col leading-none hidden sm:flex">
            <span className="font-bold text-white text-sm tracking-wide truncate">Xkimm Xa Mali</span>
            <span className="text-white/45 text-[10px] tracking-widest uppercase mt-0.5">Admin Portal</span>
          </span>
          <span className="hidden md:flex items-center gap-1 ml-1 text-xxm-gold/70 text-xs font-medium">
            <ChevronRight size={12} aria-hidden />
            Admin
          </span>
        </Link>

        <div className="flex items-center gap-2 pl-2 border-l border-white/15 ml-1">
          <div className="w-8 h-8 rounded-full bg-xxm-gold/20 border border-xxm-gold/40 flex items-center justify-center shrink-0" aria-hidden>
            <span className="text-xs font-bold text-xxm-gold">{userInitials}</span>
          </div>
          <span className="text-white/70 text-sm hidden md:block max-w-[120px] truncate">{userName}</span>
          {signOutSlot}
        </div>
      </div>
    </header>
  )
}
