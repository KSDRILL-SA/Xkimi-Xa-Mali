import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { Alert } from '@/components/ui/Alert'

export const metadata: Metadata = { title: 'Set new password' }

interface Props {
  searchParams: Promise<{ token?: string; reset?: string }>
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token, reset } = await searchParams

  if (reset) {
    return (
      <>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-xxm-green-900">Password updated</h1>
        </div>
        <Alert variant="success">Your password has been reset. You can now sign in.</Alert>
      </>
    )
  }

  if (!token) redirect('/forgot-password')

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-xxm-green-900">Set new password</h1>
        <p className="text-sm text-gray-500 mt-1">Choose a strong password for your account.</p>
      </div>
      <ResetPasswordForm token={token} />
    </>
  )
}
