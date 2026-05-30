import { Resend } from 'resend'
import { env } from '@/lib/env'
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendInviteEmail,
  sendOverdueReminderEmail,
} from '@/lib/email'
import type { IEmailProvider } from './types'

const resend = new Resend(env.RESEND_API_KEY)

export const resendProvider: IEmailProvider = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendInviteEmail,
  sendOverdueReminderEmail,
  sendGenericEmail: async (to: string, subject: string, html: string) => {
    await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to,
      subject,
      html,
    })
  },
}
