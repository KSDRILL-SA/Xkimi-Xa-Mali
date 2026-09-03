export interface IEmailProvider {
  sendVerificationEmail(to: string, firstName: string, token: string, baseUrl: string): Promise<void>
  sendPasswordResetEmail(to: string, firstName: string, token: string, baseUrl: string): Promise<void>
  sendWelcomeEmail(to: string, firstName: string, idempotencyKey?: string): Promise<void>
  sendPaymentSuccessEmail(to: string, firstName: string, amount: string, period: string, idempotencyKey?: string): Promise<void>
  sendPaymentFailedEmail(to: string, firstName: string, amount: string, period: string, dashboardUrl: string, idempotencyKey?: string): Promise<void>
  sendInviteEmail(to: string, firstName: string, code: string, registrationUrl: string): Promise<void>
  sendOverdueReminderEmail(to: string, firstName: string, amount: string, period: string, dashboardUrl: string, idempotencyKey?: string): Promise<void>
  sendBroadcastEmail(to: string, firstName: string, subject: string, message: string, idempotencyKey?: string): Promise<void>
  sendGenericEmail(to: string, subject: string, html: string, idempotencyKey?: string): Promise<void>
}
