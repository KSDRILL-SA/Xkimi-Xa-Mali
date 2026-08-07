'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@xxm/utils'

type RevealVariant = 'up' | 'left' | 'right' | 'scale'

interface RevealProps {
  children: React.ReactNode
  variant?: RevealVariant
  /** Delay in milliseconds before the reveal transition starts. */
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'li' | 'article' | 'span'
}

const variantClass: Record<RevealVariant, string> = {
  up: 'reveal',
  left: 'reveal-left',
  right: 'reveal-right',
  scale: 'reveal-scale',
}

/** Self-observing scroll-reveal wrapper for a single element. */
export function Reveal({ children, variant = 'up', delay = 0, className, as = 'div' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const Tag = as as 'div'

  return (
    <Tag
      ref={ref}
      className={cn(variantClass[variant], visible && 'revealed', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  )
}
