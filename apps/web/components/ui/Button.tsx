'use client'

import { forwardRef, cloneElement, isValidElement } from 'react'
import { clsx } from 'clsx'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  asChild?: boolean
}

const base =
  'inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'

const variants: Record<Variant, string> = {
  primary: 'bg-xxm-green text-white hover:bg-xxm-green-700 active:scale-[0.98]',
  secondary: 'bg-xxm-gold text-xxm-green-900 hover:bg-xxm-gold-dark active:scale-[0.98]',
  ghost: 'text-xxm-green hover:bg-xxm-green-100 active:scale-[0.98]',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]',
  outline: 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 active:scale-[0.98]',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, asChild, children, disabled, ...props }, ref) => {
    const classes = clsx(base, variants[variant], sizes[size], className)

    // Render the single child element with button styling applied (e.g. an <a> or <Link>)
    if (asChild && isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>
      return cloneElement(child, { className: clsx(classes, child.props.className) })
    }

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading && (
          <span className="h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
export { Button }
