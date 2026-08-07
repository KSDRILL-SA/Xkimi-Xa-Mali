import React, { forwardRef } from 'react'
import { cn } from '@xxm/utils'
import { CheckCircle2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type InputSize = 'sm' | 'md' | 'lg'

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  error?: string
  hint?: string
  icon?: LucideIcon
  size?: InputSize
  success?: boolean
  prefix?: string
  suffix?: string | LucideIcon | React.ReactNode
}

const sizeClasses: Record<InputSize, string> = {
  sm: 'h-8  text-xs  rounded-lg',
  md: 'h-10 text-sm  rounded-xl',
  lg: 'h-12 text-base rounded-xl',
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, hint, icon: Icon, size = 'md', success, prefix, suffix: Suffix, disabled, ...props }, ref) => {
    const isSuffixIcon  = Suffix && typeof Suffix === 'function'
    const isSuffixStr   = Suffix && typeof Suffix === 'string'
    const isSuffixNode  = Suffix && !isSuffixIcon && !isSuffixStr
    const SuffixIcon    = isSuffixIcon ? (Suffix as LucideIcon) : null

    return (
      <div className="w-full">
        <div className="relative">
          {Icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none">
              <Icon size={15} aria-hidden />
            </span>
          )}
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xxm-gray-500 text-sm pointer-events-none select-none">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            disabled={disabled}
            className={cn(
              'w-full border px-3 bg-white text-xxm-green-900',
              'placeholder:text-xxm-gray-400 outline-none transition-all duration-150',
              'focus:border-xxm-green focus:ring-2 focus:ring-xxm-green/15 focus:shadow-xxm-sm',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-xxm-gray-50',
              sizeClasses[size],
              Icon || prefix ? 'pl-9' : '',
              (success || Suffix) ? 'pr-9' : '',
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-200/50 bg-red-50/30'
                : success
                  ? 'border-xxm-green/50 focus:border-xxm-green focus:ring-xxm-green/15'
                  : 'border-xxm-gray-200 hover:border-xxm-gray-300',
              className,
            )}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${props.id}-error` : hint ? `${props.id}-hint` : undefined}
            {...props}
          />
          {success && !error && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xxm-green pointer-events-none">
              <CheckCircle2 size={15} aria-hidden />
            </span>
          )}
          {isSuffixStr && !success && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xxm-gray-500 text-sm pointer-events-none select-none">
              {Suffix as string}
            </span>
          )}
          {SuffixIcon && !success && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none">
              <SuffixIcon size={15} aria-hidden />
            </span>
          )}
          {isSuffixNode && !success && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              {Suffix as React.ReactNode}
            </span>
          )}
        </div>
        {error && (
          <p id={`${props.id}-error`} className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={`${props.id}-hint`} className="mt-1.5 text-xs text-xxm-gray-400">
            {hint}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
export { Input }
