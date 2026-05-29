import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import { SkeletonForm } from '@/components/ui/Skeleton'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-xxm-green-900">Welcome back</h1>
        <p className="text-sm text-gray-500 mt-1">Sign in to your account</p>
      </div>
      <Suspense fallback={<SkeletonForm fields={2} />}>
        <LoginForm />
      </Suspense>
    </>
  )
}
