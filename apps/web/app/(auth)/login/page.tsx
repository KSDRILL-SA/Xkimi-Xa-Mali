import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import { AuthHeading } from '@/components/auth/AuthHeading'
import { SkeletonForm } from '@/components/ui/Skeleton'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <>
      <AuthHeading title="Welcome back" subtitle="Sign in to your account" />
      <Suspense fallback={<SkeletonForm fields={2} />}>
        <LoginForm />
      </Suspense>
    </>
  )
}
