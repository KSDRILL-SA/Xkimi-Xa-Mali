import type { Metadata } from 'next'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { AuthHeading } from '@/components/auth/AuthHeading'
import { AuthCard } from '@/components/auth/AuthCard'

export const metadata: Metadata = { title: 'Create account' }

export default function RegisterPage() {
  return (
    <AuthCard>
      <>
        <AuthHeading title="Join Xkimi Xa Mali Foundation" subtitle="Create your member account" />
        <RegisterForm />
      </>
    </AuthCard>
  )
}
