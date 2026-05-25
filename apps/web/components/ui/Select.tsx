import { forwardRef } from 'react'
import { clsx } from 'clsx'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => (
    <div className="w-full">
      <select
        ref={ref}
        className={clsx(
          'w-full h-10 rounded-lg border px-3 text-sm bg-white text-xxm-green-900',
          'outline-none transition-colors cursor-pointer',
          'focus:border-xxm-green focus:ring-2 focus:ring-xxm-green/20',
          error ? 'border-red-400' : 'border-gray-300',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  ),
)

Select.displayName = 'Select'
export { Select }
