'use client'

import {
  createContext, useContext, useRef, useState, useEffect, useLayoutEffect, useCallback, useId,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@xxm/utils'
import type { LucideIcon } from 'lucide-react'

interface DropdownCtx {
  open: boolean
  toggle: () => void
  close: () => void
  triggerId: string
  menuId: string
  triggerRef: React.RefObject<HTMLButtonElement | null>
  menuRef: React.RefObject<HTMLDivElement | null>
}

/** `useLayoutEffect` warns during SSR; the menu only ever measures in a browser. */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const Ctx = createContext<DropdownCtx | null>(null)

/**
 * Exported so custom content inside `<DropdownContent>` — anything that
 * isn't a `<DropdownItem>` and so doesn't get its auto-close for free, e.g.
 * a grid of buttons rather than a list of menu rows — can still call
 * `close()` itself after handling a selection.
 */
export function useDropdown() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('Dropdown subcomponent used outside <Dropdown>')
  return ctx
}

interface DropdownProps {
  children: React.ReactNode
  className?: string
}

export function Dropdown({ children, className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const uid = useId()
  const triggerId = `dd-trigger-${uid}`
  const menuId    = `dd-menu-${uid}`

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onClickOut = (e: MouseEvent) => {
      const t = e.target as Node
      // The menu is portalled to the body, so it is not inside `ref`. Without
      // the second check a mousedown on a menu item counted as "outside",
      // unmounted the menu, and the click that followed landed on nothing —
      // every item silently did nothing.
      if (ref.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOut)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOut)
    }
  }, [close])

  return (
    <Ctx.Provider value={{ open, toggle, close, triggerId, menuId, triggerRef, menuRef }}>
      <div ref={ref} className={cn('relative inline-block', className)}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function DropdownTrigger({ children, className }: { children: React.ReactNode; className?: string }) {
  const { toggle, open, triggerId, menuId, triggerRef } = useDropdown()
  return (
    <button
      ref={triggerRef}
      type="button"
      id={triggerId}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={toggle}
      className={cn('cursor-pointer', className)}
    >
      {children}
    </button>
  )
}

/**
 * The menu itself, rendered into the body rather than beside its trigger.
 *
 * Positioned absolutely inside the trigger's wrapper, it was clipped by any
 * ancestor that scrolls or hides its overflow — the rounded frame on
 * `DataTable`, the decorative clip on `StatCard`, the horizontal scroller on
 * `ScrollNav`. A menu opened in the last row of a table was cut off at the
 * table's edge, and no z-index helps: clipping is not a paint order.
 *
 * So it is portalled to the body and placed with `fixed` coordinates measured
 * from the trigger, and flips above when there is not enough room below.
 *
 * ── Horizontal placement, and the bug that motivated clamping it ───────────
 *
 * Default (`align="end"`) keeps the menu's right edge aligned with the
 * trigger's, as the old `right-0` did — right for a menu whose trigger sits
 * near the right/top of its own container, like a table row's "⋯" button.
 *
 * `align="center"` centres the menu under the trigger instead, for content
 * that is not a right-anchored list — a wide grid (the emoji picker) opened
 * from a small icon that can sit anywhere along a toolbar, including near the
 * left edge of a narrow screen.
 *
 * Both modes are clamped to stay within the viewport (an 8px margin either
 * side). Before this, `right` had a floor (`Math.max(8, …)`, so the menu could
 * not be pushed past the *right* edge) but no ceiling — nothing stopped the
 * menu's *left* edge from landing off-screen. A 256px-wide grid opened from a
 * trigger in the left half of a 360px phone screen computed a `right` value
 * that put most of the panel off the left edge: exactly "faded sideways,
 * only half visible," reported against the emoji picker. The clamp caps how
 * far either `left` or `right` can push the panel, so it always lands fully
 * on screen regardless of where its trigger sits.
 *
 * The trade-off, stated: a fixed menu does not travel with a scrolling
 * container, so it is repositioned on scroll and resize, and any scroll outside
 * its own list closes it. That is the ordinary behaviour of a menu, and it is
 * better than one that is invisible.
 */
export function DropdownContent({
  children,
  className,
  align = 'end',
}: {
  children: React.ReactNode
  className?: string
  /** `'end'` (default) right-anchors to the trigger; `'center'` centres under it. */
  align?: 'end' | 'center'
}) {
  const { open, menuId, triggerId, triggerRef, menuRef } = useDropdown()
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const place = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    const menuEl = menuRef.current
    const menuHeight = menuEl?.offsetHeight ?? 0
    const menuWidth = menuEl?.offsetWidth ?? 0
    const below = window.innerHeight - r.bottom
    // Flip up only when it genuinely does not fit below and there is more room
    // above — otherwise a menu near the foot of a short page would jump upward
    // for no gain.
    const flip = menuHeight > 0 && below < menuHeight + 8 && r.top > below
    const top = flip ? r.top - menuHeight - 4 : r.bottom + 4

    // The upper bound can be narrower than the 8px floor when the menu is
    // wider than the viewport itself; re-flooring it keeps the result >= 8
    // rather than an inverted (and therefore ignored) clamp range.
    const maxEdge = Math.max(8, window.innerWidth - menuWidth - 8)

    if (align === 'center') {
      const idealLeft = r.left + r.width / 2 - menuWidth / 2
      setPos({ top, left: Math.min(Math.max(8, idealLeft), maxEdge) })
    } else {
      const idealRight = window.innerWidth - r.right
      setPos({ top, right: Math.min(Math.max(8, idealRight), maxEdge) })
    }
  }, [triggerRef, menuRef, align])

  useIsomorphicLayoutEffect(() => {
    if (!open) { setPos(null); return }
    place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onMove = () => place()
    // `capture` so a scroll inside any ancestor is heard, not just the window.
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, place])

  if (!open || !mounted) return null

  return createPortal(
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-labelledby={triggerId}
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        ...(pos?.left !== undefined ? { left: pos.left } : { right: pos?.right ?? 0 }),
      }}
      className={cn(
        'z-50 min-w-[180px] bg-white rounded-xl shadow-xxm border border-xxm-gray-100',
        'py-1 animate-scale-in',
        // Hidden until measured, so it cannot be seen at the wrong place for a
        // frame before the first layout pass lands.
        pos ? 'visible' : 'invisible',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}

export function DropdownLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('px-3 py-1.5 text-xs font-semibold text-xxm-gray-400 uppercase tracking-wide', className)}>
      {children}
    </p>
  )
}

export function DropdownSeparator({ className }: { className?: string }) {
  return <hr className={cn('my-1 border-xxm-gray-100', className)} />
}

interface DropdownItemProps {
  children: React.ReactNode
  icon?: LucideIcon
  onClick?: () => void
  className?: string
  disabled?: boolean
  destructive?: boolean
}

export function DropdownItem({ children, icon: Icon, onClick, className, disabled, destructive }: DropdownItemProps) {
  const { close } = useDropdown()

  const handleClick = () => {
    if (disabled) return
    onClick?.()
    close()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') handleClick()
  }

  return (
    <div
      role="menuitem"
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer rounded-lg mx-1',
        'transition-colors duration-100 outline-none',
        'focus-visible:bg-xxm-champagne',
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : destructive
            ? 'text-red-600 hover:bg-red-50'
            : 'text-xxm-gray-700 hover:bg-xxm-champagne',
        className,
      )}
    >
      {Icon && <Icon size={14} aria-hidden className="shrink-0" />}
      {children}
    </div>
  )
}
