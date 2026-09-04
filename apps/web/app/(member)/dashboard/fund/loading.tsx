import { SkeletonCard } from '@/components/ui/Skeleton'

export default function FundLoading() {
  return (
    <div className="space-y-5">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}
