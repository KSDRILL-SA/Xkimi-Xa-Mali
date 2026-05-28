import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
  hint?: string
  icon?: LucideIcon
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, hint, icon: Icon, ...props }, ref) => (
    <div className="w-full">
      <div className="relative">
        {Icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            <Icon size={15} aria-hidden />
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'w-full h-10 rounded-xl border px-3 text-sm bg-white text-xxm-green-900',
            'placeholder:text-gray-400 outline-none transition-all duration-150',
            'focus:border-xxm-green focus:ring-2 focus:ring-xxm-green/15 focus:shadow-xxm-sm',
            Icon ? 'pl-9' : '',
            error
              ? 'border-red-400 focus:border-red-500 focus:ring-red-200/50 bg-red-50/30'
              : 'border-gray-200 hover:border-gray-300',
            className,
          )}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${props.id}-error` : hint ? `${props.id}-hint` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={`${props.id}-error`} className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${props.id}-hint`} className="mt-1.5 text-xs text-gray-400">
          {hint}
        </p>
      )}
    </div>
  ),
)

Input.displayName = 'Input'
export { Input }
