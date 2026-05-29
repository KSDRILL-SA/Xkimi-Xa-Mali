'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T, index: number) => React.ReactNode
  sortable?: boolean
  width?: string
  align?: 'left' | 'center' | 'right'
  sticky?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (row: T) => string
  loading?: boolean
  emptyState?: React.ReactNode
  onSort?: (key: string, dir: 'asc' | 'desc') => void
  caption?: string
  stickyHeader?: boolean
  striped?: boolean
  className?: string
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="skeleton h-4 rounded w-full max-w-[140px]" />
        </td>
      ))}
    </tr>
  )
}

function DefaultEmpty() {
  return (
    <div className="py-16 text-center">
      <p className="text-xxm-gray-400 text-sm">No records found.</p>
    </div>
  )
}

type SortDir = 'asc' | 'desc'

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  loading,
  emptyState,
  onSort,
  caption,
  stickyHeader,
  striped,
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [fadeLeft,  setFadeLeft]  = useState(false)
  const [fadeRight, setFadeRight] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const updateFades = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setFadeLeft(el.scrollLeft > 6)
    setFadeRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 6)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const raf = requestAnimationFrame(updateFades)
    el.addEventListener('scroll', updateFades, { passive: true })
    const ro = new ResizeObserver(updateFades)
    ro.observe(el)
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', updateFades); ro.disconnect() }
  }, [updateFades])

  const handleSort = (col: Column<T>) => {
    if (!col.sortable) return
    const key = String(col.key)
    const dir: SortDir = sortKey === key && sortDir === 'asc' ? 'desc' : 'asc'
    setSortKey(key)
    setSortDir(dir)
    onSort?.(key, dir)
  }

  const alignClass = (align?: 'left' | 'center' | 'right') =>
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'

  return (
    <div className={cn('relative rounded-card border border-xxm-gray-100 overflow-hidden', className)}>
      {/* Scroll fade masks */}
      <div
        className={cn('nav-fade-left transition-opacity duration-200', fadeLeft ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      />
      <div
        className={cn('nav-fade-right transition-opacity duration-200', fadeRight ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      />

      <div ref={scrollRef} className="overflow-x-auto scrollbar-none">
        <table className="w-full min-w-max border-collapse">
          {caption && (
            <caption className="sr-only">{caption}</caption>
          )}

          <thead
            className={cn(
              'bg-xxm-gray-50 border-b border-xxm-gray-100',
              stickyHeader && 'sticky top-0 z-10 shadow-xxm-sm',
            )}
          >
            <tr>
              {columns.map((col) => {
                const key       = String(col.key)
                const isActive  = sortKey === key
                const isSorted  = isActive && col.sortable

                return (
                  <th
                    key={key}
                    scope="col"
                    style={{ width: col.width }}
                    className={cn(
                      'px-4 py-3 text-label font-semibold text-xxm-gray-500 uppercase whitespace-nowrap select-none',
                      alignClass(col.align),
                      col.sticky && 'sticky left-0 bg-xxm-gray-50 z-10',
                      col.sortable && 'cursor-pointer hover:text-xxm-green-900 transition-colors duration-100',
                    )}
                    onClick={() => handleSort(col)}
                    aria-sort={
                      isSorted ? (sortDir === 'asc' ? 'ascending' : 'descending') : col.sortable ? 'none' : undefined
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <span className={cn('flex flex-col', isActive ? 'text-xxm-gold' : 'text-xxm-gray-300')}>
                          <ChevronUp  size={10} className={cn('-mb-0.5', isActive && sortDir === 'asc'  ? 'opacity-100' : 'opacity-40')} aria-hidden />
                          <ChevronDown size={10} className={cn(isActive && sortDir === 'desc' ? 'opacity-100' : 'opacity-40')} aria-hidden />
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-xxm-gray-50">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={columns.length} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  {emptyState ?? <DefaultEmpty />}
                </td>
              </tr>
            ) : (
              data.map((row, rowIdx) => (
                <tr
                  key={keyExtractor(row)}
                  className={cn(
                    'transition-colors duration-100 hover:bg-xxm-green-50',
                    striped && rowIdx % 2 === 1 && 'bg-xxm-champagne-50',
                  )}
                >
                  {columns.map((col) => {
                    const key = String(col.key)
                    const value = col.render
                      ? col.render(row, rowIdx)
                      : (row as Record<string, unknown>)[key] as React.ReactNode

                    return (
                      <td
                        key={key}
                        className={cn(
                          'px-4 py-3 text-sm text-xxm-gray-700 whitespace-nowrap',
                          alignClass(col.align),
                          col.sticky && 'sticky left-0 bg-white z-[1]',
                        )}
                      >
                        {value}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
