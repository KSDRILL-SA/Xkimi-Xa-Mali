import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  const visible = items.length > 2 ? [{ label: '…' }, ...items.slice(-2)] : items

  return (
    <nav aria-label="Breadcrumb" className={cn('', className)}>
      <ol className="flex items-center gap-1 flex-wrap">
        {visible.map((item, idx) => {
          const isLast   = idx === visible.length - 1
          const isDots   = item.label === '…'
          const original = isDots ? items[items.length - 3] : item

          return (
            <li key={idx} className="flex items-center gap-1">
              {idx > 0 && (
                <ChevronRight size={12} className="text-xxm-gray-300 shrink-0" aria-hidden />
              )}
              {isLast || isDots || !item.href ? (
                <span
                  className={cn(
                    'text-xs font-medium',
                    isLast ? 'text-xxm-green-900' : 'text-xxm-gray-400',
                  )}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-xs font-medium text-xxm-gray-400 hover:text-xxm-green transition-colors outline-none focus-visible:underline"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
