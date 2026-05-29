'use client'

import { createContext, useContext, useRef, useState, useEffect, useCallback, useId } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface DropdownCtx {
  open: boolean
  toggle: () => void
  close: () => void
  triggerId: string
  menuId: string
}

const Ctx = createContext<DropdownCtx | null>(null)

function useDropdown() {
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
  const uid = useId()
  const triggerId = `dd-trigger-${uid}`
  const menuId    = `dd-menu-${uid}`

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onClickOut = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOut)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOut)
    }
  }, [close])

  return (
    <Ctx.Provider value={{ open, toggle, close, triggerId, menuId }}>
      <div ref={ref} className={cn('relative inline-block', className)}>
        {children}
      </div>
    </Ctx.Provider>
  )
}

export function DropdownTrigger({ children, className }: { children: React.ReactNode; className?: string }) {
  const { toggle, open, triggerId, menuId } = useDropdown()
  return (
    <div
      id={triggerId}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      onClick={toggle}
      className={cn('cursor-pointer', className)}
    >
      {children}
    </div>
  )
}

export function DropdownContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { open, menuId, triggerId } = useDropdown()
  if (!open) return null

  return (
    <div
      id={menuId}
      role="menu"
      aria-labelledby={triggerId}
      className={cn(
        'absolute right-0 top-full mt-1 z-50',
        'min-w-[180px] bg-white rounded-xl shadow-xxm border border-xxm-gray-100',
        'py-1 animate-scale-in',
        className,
      )}
    >
      {children}
    </div>
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
