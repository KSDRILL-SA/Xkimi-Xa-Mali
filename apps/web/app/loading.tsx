export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-xxm-champagne">
      <div className="flex flex-col items-center gap-3">
        <div
          className="h-10 w-10 rounded-full border-4 border-xxm-green-200 border-t-xxm-green-700 animate-spin"
          role="status"
          aria-label="Loading"
        />
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    </div>
  )
}
