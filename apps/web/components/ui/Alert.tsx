'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react'

type Variant = 'success' | 'error' | 'info' | 'warning'

interface AlertProps {
  variant?: Variant
  title?: string
  children: React.ReactNode
  className?: string
  onDismiss?: () => void
  action?: { label: string; onClick: () => void }
}

const styles: Record<Variant, { container: string; icon: string }> = {
  success: {
    container: 'bg-xxm-green-50 border-xxm-green-200 text-xxm-green-800',
    icon: 'text-xxm-green-600',
  },
  error: {
    container: 'bg-red-50 border-red-200 text-red-800',
    icon: 'text-red-500',
  },
  info: {
    container: 'bg-blue-50 border-blue-200 text-blue-800',
    icon: 'text-blue-500',
  },
  warning: {
    container: 'bg-amber-50 border-amber-200 text-amber-800',
    icon: 'text-amber-500',
  },
}

const icons: Record<Variant, React.ElementType> = {
  success: CheckCircle2,
  error:   AlertCircle,
  info:    Info,
  warning: AlertTriangle,
}

export function Alert({ variant = 'info', title, children, className, onDismiss, action }: AlertProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const { container, icon: iconColor } = styles[variant]
  const Icon = icons[variant]

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm flex gap-3', container, className)} role="alert">
      <Icon size={16} className={cn('shrink-0 mt-0.5', iconColor)} aria-hidden />
      <div className="flex-1 min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        <div>{children}</div>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-2 text-xs font-semibold underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current rounded"
          >
            {action.label}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          className="shrink-0 -mt-0.5 -mr-1 p-1 rounded-md opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current transition-opacity"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}
