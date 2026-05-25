import { Resend } from 'resend'
import { env } from './env'

const resend = new Resend(env.RESEND_API_KEY)

const FROM = env.RESEND_FROM_EMAIL
const APP_NAME = 'Xkimm Xa Mali'

export async function sendVerificationEmail(to: string, firstName: string, token: string, baseUrl: string) {
  const url = `${baseUrl}/auth/verify-email?token=${token}`

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Verify your ${APP_NAME} account`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
        <h1 style="color:#1B4332;margin-bottom:8px;">Welcome, ${firstName}!</h1>
        <p style="color:#374151;margin-bottom:24px;">
          Your <strong>${APP_NAME}</strong> account has been created. Please verify your
          email address to activate it.
        </p>
        <a href="${url}"
           style="display:inline-block;background:#1B4332;color:#fff;text-decoration:none;
                  padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
          Verify Email Address
        </a>
        <p style="color:#6B7280;font-size:13px;margin-top:24px;">
          This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:32px 0;" />
        <p style="color:#9CA3AF;font-size:12px;">
          ${APP_NAME} · "Blessed is the hand that giveth."
        </p>
      </div>
    `,
  })
}

export async function sendPasswordResetEmail(to: string, firstName: string, token: string, baseUrl: string) {
  const url = `${baseUrl}/auth/reset-password?token=${token}`

  await resend.emails.send({
    from: FROM,
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
        <h1 style="color:#1B4332;margin-bottom:8px;">Password Reset</h1>
        <p style="color:#374151;margin-bottom:24px;">
          Hi ${firstName}, we received a request to reset your <strong>${APP_NAME}</strong> password.
        </p>
        <a href="${url}"
           style="display:inline-block;background:#1B4332;color:#fff;text-decoration:none;
                  padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">
          Reset Password
        </a>
        <p style="color:#6B7280;font-size:13px;margin-top:24px;">
          This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #E5E7EB;margin:32px 0;" />
        <p style="color:#9CA3AF;font-size:12px;">
          ${APP_NAME} · "Blessed is the hand that giveth."
        </p>
      </div>
    `,
  })
}
