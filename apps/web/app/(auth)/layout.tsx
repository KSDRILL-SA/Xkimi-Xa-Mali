import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Auth' }

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout min-h-dvh flex flex-col">
      {/* Background with brand gradient */}
      <div className="auth-bg fixed inset-0 -z-10" />

      {/* Content */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        {/* Brand mark */}
        <Link href="/" className="mb-8 flex flex-col items-center gap-2 group">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
            <span className="text-2xl font-black text-xxm-gold tracking-tighter">X</span>
          </div>
          <span className="text-white font-bold text-lg tracking-wide drop-shadow">Xkimm Xa Mali</span>
          <span className="text-white/60 text-xs italic">"Blessed is the hand that giveth."</span>
        </Link>

        {/* Card */}
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
          {children}
        </div>

        <p className="mt-6 text-white/40 text-xs text-center">
          © {new Date().getFullYear()} Xkimm Xa Mali. Private platform.
        </p>
      </div>
    </div>
  )
}
