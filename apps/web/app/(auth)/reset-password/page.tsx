import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { AuthHeading } from '@/components/auth/AuthHeading'
import { Alert } from '@/components/ui/Alert'
import { AuthCard } from '@/components/auth/AuthCard'

export const metadata: Metadata = { title: 'Set new password' }

interface Props {
  searchParams: Promise<{ token?: string; reset?: string }>
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token, reset } = await searchParams

  if (reset) {
    return (
      <AuthCard>
        <AuthHeading title="Password updated" />
        <Alert variant="success">Your password has been reset. You can now sign in.</Alert>
      </AuthCard>
    )
  }

  if (!token) redirect('/forgot-password')

  return (
    <AuthCard>
      <AuthHeading title="Set new password" subtitle="Choose a strong password for your account." />
      <ResetPasswordForm token={token} />
    </AuthCard>
  )
}
