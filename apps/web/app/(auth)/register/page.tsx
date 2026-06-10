import type { Metadata } from 'next'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { AuthHeading } from '@/components/auth/AuthHeading'

export const metadata: Metadata = { title: 'Create account' }

export default function RegisterPage() {
  return (
    <>
      <AuthHeading title="Join Xkimm Xa Mali" subtitle="Create your member account" />
      <RegisterForm />
    </>
  )
}
