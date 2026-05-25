import { forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, error, ...props }, ref) => (
  <div className="w-full">
    <input
      ref={ref}
      className={clsx(
        'w-full h-10 rounded-lg border px-3 text-sm bg-white text-xxm-green-900',
        'placeholder:text-gray-400 outline-none transition-colors',
        'focus:border-xxm-green focus:ring-2 focus:ring-xxm-green/20',
        error ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-gray-300',
        className,
      )}
      {...props}
    />
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
))

Input.displayName = 'Input'
export { Input }
