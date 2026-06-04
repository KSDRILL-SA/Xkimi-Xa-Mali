import Link from 'next/link'
import { FileSearch } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-xxm-champagne p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-14 h-14 rounded-full bg-xxm-gray-100 flex items-center justify-center mx-auto">
          <FileSearch size={24} className="text-xxm-gray-400" />
        </div>
        <h1 className="text-2xl font-bold text-xxm-green-900">Page not found</h1>
        <p className="text-sm text-xxm-gray-500">That page doesn&apos;t exist in the admin portal.</p>
        <Link href="/" className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors">
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}
