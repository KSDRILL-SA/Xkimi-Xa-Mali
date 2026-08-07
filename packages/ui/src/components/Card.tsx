import { cn } from '@xxm/utils'

type CardVariant = 'default' | 'outlined' | 'glass' | 'elevated' | 'champagne' | 'premium'

interface CardProps {
  className?: string
  children: React.ReactNode
  variant?: CardVariant
  interactive?: boolean
  noPadding?: boolean
}

const variantClasses: Record<CardVariant, string> = {
  default:    'bg-white border border-xxm-green/7 shadow-xxm-sm',
  outlined:   'bg-white border-2 border-xxm-gray-200',
  glass:      'bg-white/70 backdrop-blur border border-white/60 shadow-glass',
  elevated:   'bg-white border border-xxm-green/7 shadow-xxm-lg',
  champagne:  'bg-xxm-champagne-50 border border-xxm-gold/15 shadow-xxm-sm',
  premium:    'glass-dark text-white shadow-glass border border-xxm-gold/20',
}

export function Card({ className, children, variant = 'default', interactive, noPadding }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card',
        variantClasses[variant],
        interactive && 'card-hover cursor-pointer',
        interactive && variant === 'premium' && 'hover:animate-border-glow',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 py-4 border-b border-xxm-gray-100', className)}>
      <div>
        <h3 className="font-semibold text-xxm-green-900">{title}</h3>
        {description && <p className="text-sm text-xxm-gray-500 mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center justify-end gap-2 px-5 py-4 border-t border-xxm-gray-100', className)}>
      {children}
    </div>
  )
}
