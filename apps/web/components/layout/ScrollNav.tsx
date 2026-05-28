'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRef, useEffect, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
}

interface ScrollNavProps {
  items: NavItem[]
  variant?: 'member' | 'admin'
}

export function ScrollNav({ items, variant = 'member' }: ScrollNavProps) {
  const pathname = usePathname()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [fadeLeft, setFadeLeft]   = useState(false)
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
    updateFades()
    el.addEventListener('scroll', updateFades, { passive: true })
    const ro = new ResizeObserver(updateFades)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateFades)
      ro.disconnect()
    }
  }, [updateFades])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const activeEl = el.querySelector<HTMLElement>('[data-active="true"]')
    if (activeEl) {
      const target = activeEl.offsetLeft - el.clientWidth / 2 + activeEl.offsetWidth / 2
      el.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
    }
  }, [pathname])

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href + '/'))

  const isAdminVariant = variant === 'admin'

  return (
    <nav
      aria-label={isAdminVariant ? 'Admin navigation' : 'Main navigation'}
      className={cn(
        'relative border-b',
        isAdminVariant
          ? 'bg-xxm-green-900 border-white/10'
          : 'bg-white border-gray-100 shadow-[0_1px_0_0_rgba(27,67,50,0.06)]',
      )}
    >
      {/* Left fade mask */}
      <div
        className={cn(
          'nav-fade-left transition-opacity duration-200',
          isAdminVariant && '[background:linear-gradient(to_right,#14532d_30%,transparent)]',
          fadeLeft ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />

      {/* Right fade mask */}
      <div
        className={cn(
          'nav-fade-right transition-opacity duration-200',
          isAdminVariant && '[background:linear-gradient(to_left,#14532d_30%,transparent)]',
          fadeRight ? 'opacity-100' : 'opacity-0',
        )}
        aria-hidden
      />

      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 px-3 overflow-x-auto scrollbar-none"
        style={{ height: 'var(--nav-h)' }}
      >
        {items.map((item) => {
          const active = isActive(item)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              data-active={active}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex items-center gap-2 px-3.5 py-2 rounded-full text-[13px] font-medium',
                'whitespace-nowrap select-none outline-none',
                'transition-all duration-200 ease-out',
                'focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-offset-1',
                'hover:scale-[1.04] active:scale-[0.96]',
                isAdminVariant
                  ? active
                    ? 'bg-xxm-gold text-xxm-green-900 font-semibold shadow-gold-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                  : active
                    ? 'bg-xxm-gold text-xxm-green-900 font-semibold shadow-gold-sm'
                    : 'text-gray-500 hover:text-xxm-green hover:bg-xxm-green-50',
              )}
            >
              <Icon
                size={14}
                strokeWidth={active ? 2.5 : 2}
                aria-hidden
              />
              {item.label}

              {/* Active indicator dot */}
              {active && (
                <span
                  className="absolute -bottom-[3px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-xxm-gold-dark"
                  aria-hidden
                />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
