import { cn } from '@xxm/utils'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'md',
}: EmptyStateProps) {
  const sizes = {
    sm: { wrap: 'py-8',  icon: 36, title: 'text-sm',  desc: 'text-xs' },
    md: { wrap: 'py-12', icon: 44, title: 'text-base', desc: 'text-sm' },
    lg: { wrap: 'py-16', icon: 52, title: 'text-lg',   desc: 'text-sm' },
  }[size]

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3 xxm-card',
        sizes.wrap,
        'px-6',
        className,
      )}
      aria-label={title}
    >
      {/* Icon container */}
      <div className="rounded-2xl bg-xxm-champagne border border-xxm-gold/20 p-4 shadow-gold-sm">
        <Icon size={sizes.icon} className="text-xxm-green/40" strokeWidth={1.5} aria-hidden />
      </div>

      {/* Text */}
      <div className="max-w-xs space-y-1.5">
        <p className={cn('font-semibold text-xxm-green-900', sizes.title)}>{title}</p>
        {description && (
          <p className={cn('text-gray-400 leading-relaxed', sizes.desc)}>{description}</p>
        )}
      </div>

      {/* CTA */}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
