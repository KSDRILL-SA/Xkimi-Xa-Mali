import { Skeleton, SkeletonCard, SkeletonTable } from '@xxm/ui'

export default function Loading() {
  return (
    <div className="space-y-6 animate-fade-in" aria-label="Loading member" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40 opacity-60" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-36" rounded="lg" />
          <Skeleton className="h-9 w-24" rounded="lg" />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable rows={6} cols={4} />
    </div>
  )
}
