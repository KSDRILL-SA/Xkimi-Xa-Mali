import { Suspense } from 'react'
import type { Metadata } from 'next'
import { AdminLoginForm } from '@/components/auth/AdminLoginForm'
import { XmmLogo } from '@xxm/ui'
import { ShieldCheck, Lock, Users, BarChart3 } from 'lucide-react'

export const metadata: Metadata = { title: 'Login — XXM Admin' }

const features = [
  { icon: Users,    text: 'Manage all member accounts' },
  { icon: BarChart3, text: 'View financial reports' },
  { icon: ShieldCheck, text: 'Full audit trail' },
]

export default function AdminLoginPage() {
  return (
    <div className="min-h-dvh grid lg:grid-cols-2">

      {/* ── Left panel (branding) ─────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 text-white">
        <div className="flex items-center gap-3">
          <XmmLogo variant="light" size={36} />
          <span className="font-bold text-lg tracking-tight">Xkimm Xa Mali</span>
        </div>

        <div className="space-y-8">
          <div>
            <p className="text-xxm-gold text-xs font-bold tracking-widest uppercase mb-3">Admin Portal</p>
            <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
              Manage your<br />
              <span className="text-xxm-gold">collective platform</span>
            </h1>
            <p className="text-green-200/80 mt-4 text-sm leading-relaxed max-w-xs">
              A secure portal for authorised administrators to manage members, contributions, and the financial collective.
            </p>
          </div>

          <div className="space-y-3">
            {features.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-xxm-gold" aria-hidden />
                </div>
                <span className="text-sm text-green-100">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-green-200/40">
          © {new Date().getFullYear()} Xkimm Xa Mali. Restricted access only.
        </p>
      </div>

      {/* ── Right panel (form) ───────────────────────────── */}
      <div className="flex items-center justify-center p-6 bg-xxm-champagne">
        <div className="w-full max-w-sm space-y-8">

          {/* Mobile logo */}
          <div className="flex flex-col items-center text-center lg:hidden">
            <div className="w-14 h-14 rounded-2xl bg-xxm-green flex items-center justify-center mb-4">
              <XmmLogo variant="light" size={32} />
            </div>
            <h1 className="text-xl font-extrabold text-xxm-green-900">Admin Portal</h1>
            <p className="text-sm text-xxm-gray-500 mt-1">Restricted to authorised administrators</p>
          </div>

          <div className="hidden lg:block">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-lg bg-xxm-green flex items-center justify-center">
                <Lock size={13} className="text-white" aria-hidden />
              </div>
              <p className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">Secure Sign In</p>
            </div>
            <h2 className="text-2xl font-extrabold text-xxm-green-900 tracking-tight">Welcome back</h2>
            <p className="text-sm text-xxm-gray-500 mt-1">Sign in to your administrator account</p>
          </div>

          <Suspense>
            <AdminLoginForm />
          </Suspense>

          <p className="text-center text-[11px] text-xxm-gray-400">
            Not an administrator?{' '}
            <a
              href={process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}
              className="text-xxm-green font-semibold hover:underline"
            >
              Go to member portal
            </a>
          </p>

        </div>
      </div>

    </div>
  )
}
