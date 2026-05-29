'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  totalItems: number
  itemsPerPage: number
  currentPage: number
  onPageChange: (page: number) => void
  className?: string
}

function buildPages(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

  const pages: (number | '…')[] = [1]

  if (current > 3) pages.push('…')

  const start = Math.max(2, current - 1)
  const end   = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)

  if (current < total - 2) pages.push('…')

  pages.push(total)
  return pages
}

export function Pagination({ totalItems, itemsPerPage, currentPage, onPageChange, className }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage)
  if (totalPages <= 1) return null

  const pages = buildPages(currentPage, totalPages)

  return (
    <nav aria-label="Pagination" className={cn('flex items-center justify-center gap-1', className)}>
      {/* Prev */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
        aria-disabled={currentPage <= 1}
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-offset-1',
          currentPage <= 1
            ? 'text-xxm-gray-300 cursor-not-allowed'
            : 'text-xxm-gray-600 hover:bg-xxm-champagne hover:text-xxm-green',
        )}
      >
        <ChevronLeft size={16} aria-hidden />
      </button>

      {/* Page numbers */}
      {pages.map((page, idx) =>
        page === '…' ? (
          <span key={`dots-${idx}`} className="w-9 h-9 flex items-center justify-center text-sm text-xxm-gray-400">
            …
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? 'page' : undefined}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-offset-1',
              page === currentPage
                ? 'bg-xxm-gold text-xxm-green-900 shadow-gold-sm'
                : 'text-xxm-gray-600 hover:bg-xxm-champagne hover:text-xxm-green',
            )}
          >
            {page}
          </button>
        ),
      )}

      {/* Next */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
        aria-disabled={currentPage >= totalPages}
        className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-offset-1',
          currentPage >= totalPages
            ? 'text-xxm-gray-300 cursor-not-allowed'
            : 'text-xxm-gray-600 hover:bg-xxm-champagne hover:text-xxm-green',
        )}
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}
