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
        'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between',
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
      {/* Allowed to wrap, and allowed to shrink.
          `shrink-0` here was right for the common case — two buttons that
          should not be squeezed — and wrong for the member page, whose action
          carries two forms, two text inputs, a select and two buttons. Refusing
          to shrink, it ran straight over the member's name (only "Drill" of
          "KS Drill" survived) and pushed the whole page into horizontal scroll
          at ordinary laptop widths. A row of buttons that wraps is a smaller
          cost than a heading nobody can read.

          The floor and the wrap on the row above work together: given less than
          22rem beside the title, the whole action block drops to its own line
          and takes the full width, rather than squeezing the name down to one
          word per line. */}
      {action && (
        <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full grow sm:grow-0 sm:min-w-[22rem] sm:justify-end">
          {action}
        </div>
      )}
    </div>
  )
}
