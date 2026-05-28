import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  validateInviteToken, acceptInvite, type AcceptInviteInput,
  InviteNotFoundError, InviteExpiredError, InviteAlreadyAcceptedError,
} from '@/services/invite.service'

export const metadata: Metadata = { title: 'Accept Invitation — Xkimm Xa Mali' }

export default async function InviteAcceptPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const { token } = await params
  const sp = await searchParams

  let invite: { email: string; expiresAt: Date } | null = null
  let tokenError: string | null = null

  try {
    invite = await validateInviteToken(token)
  } catch (e) {
    if (e instanceof InviteExpiredError)         tokenError = 'This invitation has expired. Please ask an admin to send a new one.'
    else if (e instanceof InviteAlreadyAcceptedError) tokenError = 'This invitation has already been used.'
    else if (e instanceof InviteNotFoundError)   tokenError = 'This invitation link is invalid.'
    else throw e
  }

  async function register(fd: FormData) {
    'use server'
    const { token: t } = await params
    const input: AcceptInviteInput = {
      firstName:     (fd.get('firstName') as string).trim(),
      lastName:      (fd.get('lastName')  as string).trim(),
      phone:         (fd.get('phone')     as string).trim(),
      password:      fd.get('password')  as string,
      idNumber:      (fd.get('idNumber') as string | null) || undefined,
      consentToPopia: true,
    }
    try {
      await acceptInvite(t, input)
      redirect('/auth/login?invited=1')
    } catch (e) {
      const ce = e as { code?: string; message: string }
      redirect(`/invite/${t}?error=${encodeURIComponent(ce.message)}`)
    }
  }

  if (tokenError) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-xxm-green-50 px-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <span className="text-red-600 text-xl">✕</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Invitation Invalid</h1>
          <p className="text-sm text-gray-500">{tokenError}</p>
          <Link href="/auth/login" className="inline-block text-sm text-xxm-green hover:underline">
            Go to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-xxm-green-50 px-4 py-8">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl bg-xxm-gold/20 border border-xxm-gold/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-lg font-black text-xxm-gold">X</span>
          </div>
          <h1 className="text-2xl font-bold text-xxm-green">Complete Registration</h1>
          <p className="text-sm text-gray-500 mt-1">
            You were invited to join <strong>Xkimm Xa Mali</strong>
          </p>
          <p className="text-sm font-medium text-gray-700 mt-1">{invite!.email}</p>
        </div>

        {sp.error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {decodeURIComponent(sp.error)}
          </div>
        )}

        <form action={register} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">First name</label>
              <input name="firstName" type="text" required minLength={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Last name</label>
              <input name="lastName" type="text" required minLength={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">SA mobile number</label>
            <input name="phone" type="tel" required placeholder="0821234567"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">SA ID number <span className="text-gray-400 font-normal">(optional)</span></label>
            <input name="idNumber" type="text" maxLength={13} pattern="\d{13}"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
            <input name="password" type="password" required minLength={8}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
            <p className="text-xs text-gray-400 mt-1">Min 8 characters, 1 uppercase, 1 number.</p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" name="consent" required className="mt-0.5 accent-xxm-green" />
            <span className="text-xs text-gray-600">
              I consent to the processing of my personal information in accordance with the POPIA privacy policy.
            </span>
          </label>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-green/90 transition-colors"
          >
            Create account
          </button>
        </form>

        <p className="text-center text-xs text-gray-400">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-xxm-green hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
