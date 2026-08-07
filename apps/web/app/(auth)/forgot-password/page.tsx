import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'
import { AuthHeading } from '@/components/auth/AuthHeading'

export const metadata: Metadata = { title: 'Reset password' }

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Forgot your password?"
        subtitle="Enter your email and we'll send you a reset link."
      />
      <ForgotPasswordForm />
    </>
  )
}
