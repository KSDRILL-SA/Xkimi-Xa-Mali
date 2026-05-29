import { cn } from '@xxm/utils'
import { AlertCircle } from 'lucide-react'

interface FormGroupProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

export function FormGroup({ label, htmlFor, error, hint, required, className, children }: FormGroupProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-xxm-green-900 flex items-center gap-1"
      >
        {label}
        {required && <span className="text-red-500 text-xs" aria-hidden>*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600 mt-0.5" role="alert">
          <AlertCircle size={12} aria-hidden />
          {error}
        </p>
      )}
      {!error && hint && (
        <p className="text-xs text-xxm-gray-400 mt-0.5">{hint}</p>
      )}
    </div>
  )
}
