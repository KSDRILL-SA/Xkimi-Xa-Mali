import { SkeletonCard } from '@/components/ui/Skeleton'

export default function GoalDetailLoading() {
  return (
    <div className="space-y-4">
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}
