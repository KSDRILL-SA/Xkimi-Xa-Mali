import type { Metadata } from 'next'
import { AdminLoginForm } from '@/components/auth/AdminLoginForm'
import { XmmLogo } from '@xxm/ui'

export const metadata: Metadata = { title: 'Login — XXM Admin' }

export default function AdminLoginPage() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-xxm-green p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <XmmLogo variant="light" size={44} className="mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white">Admin Portal</h1>
          <p className="text-sm text-white/60 mt-1">Restricted to authorised administrators only.</p>
        </div>
        <AdminLoginForm />
      </div>
    </div>
  )
}
