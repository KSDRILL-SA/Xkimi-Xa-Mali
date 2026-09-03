import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendInviteEmail,
  sendOverdueReminderEmail,
  sendBroadcastEmail,
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
  sendBroadcastEmail,
  sendGenericEmail,
}
