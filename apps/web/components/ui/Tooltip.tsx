'use client'

import { useRef, useState, useId } from 'react'
import { cn } from '@/lib/utils'

type Side = 'top' | 'bottom' | 'left' | 'right'

interface TooltipProps {
  content: string
  side?: Side
  delay?: number
  className?: string
  children: React.ReactNode
}

const sideClasses: Record<Side, { position: string; arrow: string }> = {
  top:    { position: '-top-1 left-1/2 -translate-x-1/2 -translate-y-full', arrow: 'top-full left-1/2 -translate-x-1/2 border-t-xxm-green-900 border-l-transparent border-r-transparent border-b-transparent' },
  bottom: { position: 'top-full left-1/2 -translate-x-1/2 translate-y-1',  arrow: 'bottom-full left-1/2 -translate-x-1/2 border-b-xxm-green-900 border-l-transparent border-r-transparent border-t-transparent' },
  left:   { position: 'right-full top-1/2 -translate-y-1/2 -translate-x-1', arrow: 'left-full top-1/2 -translate-y-1/2 border-l-xxm-green-900 border-t-transparent border-b-transparent border-r-transparent' },
  right:  { position: 'left-full top-1/2 -translate-y-1/2 translate-x-1',   arrow: 'right-full top-1/2 -translate-y-1/2 border-r-xxm-green-900 border-t-transparent border-b-transparent border-l-transparent' },
}

export function Tooltip({ content, side = 'top', delay = 300, className, children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay)
  }
  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  const { position, arrow } = sideClasses[side]

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={visible ? tooltipId : undefined}>
        {children}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          'absolute z-50 pointer-events-none whitespace-nowrap',
          'bg-xxm-green-900 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg',
          'transition-opacity duration-150',
          position,
          visible ? 'opacity-100' : 'opacity-0',
        )}
      >
        {content}
        <span
          className={cn('absolute border-4', arrow)}
          aria-hidden
        />
      </span>
    </span>
  )
}
