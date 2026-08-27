import { Shield } from 'lucide-react'
import { XmmLogo } from '@xxm/ui'

export function AppFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-auto border-t border-gray-100 bg-white">
      <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <XmmLogo size={28} />
            <p className="text-xs text-gray-400">
              &copy; {year} Xkimi Xa Mali Foundation. Admin portal — restricted access.
            </p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-xxm-green/40 font-medium uppercase tracking-wider">
            <Shield size={10} aria-hidden />
            Administrators only
          </div>
        </div>
      </div>
    </footer>
  )
}
