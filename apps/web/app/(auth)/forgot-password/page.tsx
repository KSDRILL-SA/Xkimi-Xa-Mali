import type { Metadata } from 'next'
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm'

export const metadata: Metadata = { title: 'Reset password' }

export default function ForgotPasswordPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-xxm-green-900">Forgot your password?</h1>
        <p className="text-sm text-gray-500 mt-1">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>
      <ForgotPasswordForm />
    </>
  )
}
