import { Skeleton } from '@xxm/ui'

export default function Loading() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-52 w-full rounded-3xl" />
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-10 w-28 rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-3xl" />
    </div>
  )
}
