import { cn } from '@xxm/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  action?: React.ReactNode
  className?: string
}

export function PageHeader({ title, subtitle, icon, action, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-4 min-w-0">
        {icon && (
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 ring-1 ring-xxm-green/10 flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-xxm-green-900 leading-tight">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  )
}
