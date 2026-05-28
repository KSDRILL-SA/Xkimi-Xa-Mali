import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
  rounded?: 'sm' | 'md' | 'lg' | 'full'
}

export function Skeleton({ className, rounded = 'md' }: SkeletonProps) {
  const r = { sm: 'rounded', md: 'rounded-lg', lg: 'rounded-xl', full: 'rounded-full' }[rounded]
  return <div className={cn('skeleton', r, className)} aria-hidden />
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('xxm-card p-5 space-y-3', className)} aria-hidden>
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-3 w-32 opacity-60" />
    </div>
  )
}

export function SkeletonRow({ cols = 3 }: { cols?: number }) {
  return (
    <div className="xxm-card divide-y divide-gray-100" aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3.5 gap-4">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20 opacity-60" />
          </div>
          <Skeleton className="h-6 w-16" rounded="full" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-fade-in" aria-label="Loading dashboard" aria-busy="true">
      {/* Greeting */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-44 opacity-60" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard className="col-span-2 md:col-span-1" />
      </div>
      {/* Table */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <SkeletonRow cols={4} />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4 animate-fade-in" aria-label="Loading" aria-busy="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-28" rounded="lg" />
      </div>
      <SkeletonRow cols={rows} />
    </div>
  )
}

export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-5 animate-fade-in" aria-label="Loading form" aria-busy="true">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-full" rounded="lg" />
        </div>
      ))}
      <Skeleton className="h-10 w-32 mt-2" rounded="lg" />
    </div>
  )
}
