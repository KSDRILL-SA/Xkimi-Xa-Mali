import { clsx } from 'clsx'

type Variant = 'success' | 'error' | 'info' | 'warning'

interface AlertProps {
  variant?: Variant
  children: React.ReactNode
  className?: string
}

const styles: Record<Variant, string> = {
  success: 'bg-green-50 border-green-300 text-green-800',
  error:   'bg-red-50 border-red-300 text-red-800',
  info:    'bg-blue-50 border-blue-300 text-blue-800',
  warning: 'bg-amber-50 border-amber-300 text-amber-800',
}

export function Alert({ variant = 'info', children, className }: AlertProps) {
  return (
    <div className={clsx('rounded-lg border px-4 py-3 text-sm', styles[variant], className)}>
      {children}
    </div>
  )
}
