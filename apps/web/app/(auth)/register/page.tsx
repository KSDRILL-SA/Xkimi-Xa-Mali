import type { Metadata } from 'next'
import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata: Metadata = { title: 'Create account' }

export default function RegisterPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-xxm-green-900">Join Xkimm Xa Mali</h1>
        <p className="text-sm text-gray-500 mt-1">Create your member account</p>
      </div>
      <RegisterForm />
    </>
  )
}
