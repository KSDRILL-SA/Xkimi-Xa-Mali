import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@xxm/utils'
import type { LucideIcon } from 'lucide-react'

type SelectSize = 'sm' | 'md' | 'lg'

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  error?: string
  hint?: string
  icon?: LucideIcon
  size?: SelectSize
}

const sizeClasses: Record<SelectSize, string> = {
  sm: 'h-8  text-xs  rounded-lg  pl-3 pr-8',
  md: 'h-10 text-sm  rounded-xl  pl-3 pr-9',
  lg: 'h-12 text-base rounded-xl pl-3 pr-9',
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, hint, icon: Icon, size = 'md', disabled, children, ...props }, ref) => (
    <div className="w-full">
      <div className="relative">
        {Icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none z-10">
            <Icon size={15} aria-hidden />
          </span>
        )}
        <select
          ref={ref}
          disabled={disabled}
          className={cn(
            'w-full border bg-white text-xxm-green-900 appearance-none',
            'outline-none transition-all duration-150 cursor-pointer',
            'focus:border-xxm-green focus:ring-2 focus:ring-xxm-green/15 focus:shadow-xxm-sm',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-xxm-gray-50',
            sizeClasses[size],
            Icon ? 'pl-9' : '',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200/50 bg-red-50/30'
              : 'border-xxm-gray-200 hover:border-xxm-gray-300',
            className,
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${props.id}-error` : hint ? `${props.id}-hint` : undefined}
          {...props}
        >
          {children}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none">
          <ChevronDown size={14} aria-hidden />
        </span>
      </div>
      {error && (
        <p id={`${props.id}-error`} className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${props.id}-hint`} className="mt-1.5 text-xs text-xxm-gray-400">
          {hint}
        </p>
      )}
    </div>
  ),
)

Select.displayName = 'Select'
export { Select }
