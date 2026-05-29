'use client'

import { forwardRef, cloneElement, isValidElement } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'gold' | 'tertiary'
type Size    = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  asChild?: boolean
  iconOnly?: boolean
  fullWidth?: boolean
}

const base =
  'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none select-none'

const variants: Record<Variant, string> = {
  primary:
    'bg-xxm-green text-white hover:bg-xxm-canopy active:scale-[0.97] shadow-xxm-sm hover:shadow-xxm',
  secondary:
    'bg-xxm-champagne-200 text-xxm-green-900 border border-xxm-green/15 hover:bg-xxm-champagne-300 active:scale-[0.97]',
  gold:
    'bg-xxm-gold text-xxm-green-900 hover:bg-xxm-gold-dark active:scale-[0.97] shadow-gold-sm hover:shadow-gold font-bold',
  ghost:
    'text-xxm-green hover:bg-xxm-green-100 active:scale-[0.97]',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:scale-[0.97] shadow-sm',
  outline:
    'border border-xxm-gray-200 bg-white text-xxm-gray-700 hover:bg-xxm-green-50 hover:border-xxm-green/20 hover:text-xxm-green active:scale-[0.97]',
  tertiary:
    'border border-xxm-gray-200 text-xxm-gray-700 hover:bg-xxm-gray-50 active:scale-[0.97]',
}

const sizes: Record<Size, string> = {
  xs: 'h-6  px-2   text-xs  gap-1',
  sm: 'h-8  px-3   text-xs  gap-1.5',
  md: 'h-10 px-4   text-sm  gap-2',
  lg: 'h-12 px-5   text-sm  gap-2',
  xl: 'h-14 px-8   text-base gap-2.5',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, asChild, iconOnly, fullWidth, children, disabled, ...props }, ref) => {
    const classes = cn(
      base,
      variants[variant],
      sizes[size],
      iconOnly && 'px-0 aspect-square',
      fullWidth && 'w-full',
      className,
    )

    if (asChild && isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>
      return cloneElement(child, { className: cn(classes, child.props.className) })
    }

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading && (
          <span
            className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
            aria-hidden
          />
        )}
        {children}
      </button>
    )
  },
)

Button.displayName = 'Button'
export { Button }
