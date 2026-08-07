import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendInviteEmail,
  sendOverdueReminderEmail,
  sendGenericEmail,
} from '@/lib/email'
import type { IEmailProvider } from './types'

export const resendProvider: IEmailProvider = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendInviteEmail,
  sendOverdueReminderEmail,
  sendGenericEmail,
}
