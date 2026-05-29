'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useEffect, useState, useCallback } from 'react'
import { cn } from '@xxm/utils'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
}

export function ScrollNav({ items }: { items: NavItem[] }) {
  const pathname    = usePathname()
  const scrollRef   = useRef<HTMLDivElement>(null)
  const [fadeLeft,  setFadeLeft]  = useState(false)
  const [fadeRight, setFadeRight] = useState(false)

  const updateFades = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setFadeLeft(el.scrollLeft > 6)
    setFadeRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 6)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const raf = requestAnimationFrame(updateFades)
    el.addEventListener('scroll', updateFades, { passive: true })
    const ro = new ResizeObserver(updateFades)
    ro.observe(el)
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', updateFades); ro.disconnect() }
  }, [updateFades])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const active = el.querySelector<HTMLElement>('[data-active="true"]')
    if (active) {
      const target = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2
      el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
    }
  }, [pathname])

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + '/')

  return (
    <nav aria-label="Admin navigation" className="relative bg-xxm-green-900 border-b border-white/10">
      <div className={cn('nav-fade-left transition-opacity duration-200 [background:linear-gradient(to_right,#14532d_30%,transparent)]', fadeLeft ? 'opacity-100' : 'opacity-0')} aria-hidden />
      <div className={cn('nav-fade-right transition-opacity duration-200 [background:linear-gradient(to_left,#14532d_30%,transparent)]', fadeRight ? 'opacity-100' : 'opacity-0')} aria-hidden />

      <div ref={scrollRef} className="flex items-center gap-1 px-3 overflow-x-auto scrollbar-none h-12">
        {items.map((item) => {
          const active = isActive(item)
          const Icon   = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap select-none outline-none',
                'transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-offset-1',
                'hover:scale-[1.04] active:scale-[0.96]',
                active
                  ? 'bg-xxm-gold text-xxm-green-900 font-semibold shadow-gold-sm'
                  : 'text-white/70 hover:text-white hover:bg-white/10',
              )}
            >
              <Icon size={14} strokeWidth={active ? 2.5 : 2} aria-hidden />
              {item.label}
              {active && <span className="absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-xxm-gold-dark" aria-hidden />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
