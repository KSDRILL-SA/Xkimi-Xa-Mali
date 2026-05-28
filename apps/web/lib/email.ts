import { Resend } from 'resend'
import { env } from './env'

const resend = new Resend(env.RESEND_API_KEY)

const FROM = env.RESEND_FROM_EMAIL
const APP_NAME = 'Xkimm Xa Mali'

const BASE_STYLE = `font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;`
const HEADING_STYLE = `color:#1B4332;margin-bottom:8px;`
const BODY_STYLE = `color:#374151;margin-bottom:24px;`
const BTN_STYLE = `display:inline-block;background:#1B4332;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;`
const SMALL_STYLE = `color:#6B7280;font-size:13px;margin-top:24px;`
const HR_STYLE = `border:none;border-top:1px solid #E5E7EB;margin:32px 0;`
const FOOTER_STYLE = `color:#9CA3AF;font-size:12px;`
const TAGLINE = `${APP_NAME} · "Blessed is the hand that giveth."`

function layout(content: string): string {
  return `<div style="${BASE_STYLE}">${content}<hr style="${HR_STYLE}" /><p style="${FOOTER_STYLE}">${TAGLINE}</p></div>`
}

export async function sendVerificationEmail(to: string, firstName: string, token: string, baseUrl: string) {
  const url = `${baseUrl}/auth/verify-email?token=${token}`
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Verify your ${APP_NAME} account`,
    html: layout(`
      <h1 style="${HEADING_STYLE}">Welcome, ${firstName}!</h1>
      <p style="${BODY_STYLE}">Your <strong>${APP_NAME}</strong> account has been created. Please verify your email address to activate it.</p>
      <a href="${url}" style="${BTN_STYLE}">Verify Email Address</a>
      <p style="${SMALL_STYLE}">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    `),
  })
}

export async function sendPasswordResetEmail(to: string, firstName: string, token: string, baseUrl: string) {
  const url = `${baseUrl}/auth/reset-password?token=${token}`
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: layout(`
      <h1 style="${HEADING_STYLE}">Password Reset</h1>
      <p style="${BODY_STYLE}">Hi ${firstName}, we received a request to reset your <strong>${APP_NAME}</strong> password.</p>
      <a href="${url}" style="${BTN_STYLE}">Reset Password</a>
      <p style="${SMALL_STYLE}">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>
    `),
  })
}

export async function sendWelcomeEmail(to: string, firstName: string) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Welcome to ${APP_NAME}, ${firstName}!`,
    html: layout(`
      <h1 style="${HEADING_STYLE}">Karibu, ${firstName}!</h1>
      <p style="${BODY_STYLE}">
        You have been successfully registered with <strong>${APP_NAME}</strong>. Your account is active
        and your first monthly contribution will be collected on your designated debit date.
      </p>
      <p style="${BODY_STYLE}">
        Log in at any time to view your contribution history, update your banking details,
        or track the group's financial goals.
      </p>
      <p style="${SMALL_STYLE}">
        If you have any questions, reach out to your group administrator.
      </p>
    `),
  })
}

export async function sendPaymentSuccessEmail(
  to: string,
  firstName: string,
  amount: string,
  period: string,
) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Payment received — ${APP_NAME}`,
    html: layout(`
      <h1 style="${HEADING_STYLE}">Payment Confirmed</h1>
      <p style="${BODY_STYLE}">
        Hi ${firstName}, your <strong>R${amount}</strong> contribution for <strong>${period}</strong>
        has been processed successfully. Thank you for keeping your account up to date.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;color:#6B7280;font-size:14px;">Amount</td>
          <td style="padding:10px 0;border-bottom:1px solid #E5E7EB;font-weight:600;text-align:right;">R${amount}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6B7280;font-size:14px;">Period</td>
          <td style="padding:10px 0;font-weight:600;text-align:right;">${period}</td>
        </tr>
      </table>
    `),
  })
}

export async function sendPaymentFailedEmail(
  to: string,
  firstName: string,
  amount: string,
  period: string,
  dashboardUrl: string,
) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Action required — debit declined — ${APP_NAME}`,
    html: layout(`
      <h1 style="${HEADING_STYLE}">Payment Declined</h1>
      <p style="${BODY_STYLE}">
        Hi ${firstName}, your <strong>R${amount}</strong> debit for <strong>${period}</strong>
        was not successful. Please log in and ensure your banking details are correct
        or arrange an alternative payment.
      </p>
      <a href="${dashboardUrl}" style="${BTN_STYLE}">Go to Dashboard</a>
      <p style="${SMALL_STYLE}">
        If you believe this is an error, contact your group administrator.
        Outstanding contributions accrue until settled.
      </p>
    `),
  })
}

export async function sendInviteEmail(
  to: string,
  firstName: string,
  code: string,
  registrationUrl: string,
) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `You have been invited to join ${APP_NAME}`,
    html: layout(`
      <h1 style="${HEADING_STYLE}">You're Invited, ${firstName}!</h1>
      <p style="${BODY_STYLE}">
        You have been invited to join <strong>${APP_NAME}</strong> — a secure group savings
        and contribution management platform.
      </p>
      <p style="${BODY_STYLE}">Your one-time invite code is:</p>
      <div style="background:#F3F4F6;border-radius:8px;padding:16px 24px;margin:0 0 24px;text-align:center;">
        <span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#1B4332;font-family:monospace;">${code}</span>
      </div>
      <p style="${BODY_STYLE}">
        Click the button below to open the registration page — your code will be filled in automatically.
      </p>
      <a href="${registrationUrl}" style="${BTN_STYLE}">Create My Account</a>
      <p style="${SMALL_STYLE}">
        Or copy your code and visit <strong>${APP_NAME}</strong> registration manually.<br/>
        This invitation expires in <strong>7 days</strong>. If you did not expect this, ignore this email.
      </p>
    `),
  })
}

export async function sendOverdueReminderEmail(
  to: string,
  firstName: string,
  amount: string,
  period: string,
  dashboardUrl: string,
) {
  await resend.emails.send({
    from: FROM,
    to,
    subject: `Overdue contribution — ${APP_NAME}`,
    html: layout(`
      <h1 style="${HEADING_STYLE}">Contribution Overdue</h1>
      <p style="${BODY_STYLE}">
        Hi ${firstName}, your <strong>R${amount}</strong> contribution for <strong>${period}</strong>
        is still outstanding. Please settle this as soon as possible to avoid any impact
        on your standing in the group.
      </p>
      <a href="${dashboardUrl}" style="${BTN_STYLE}">Pay Now</a>
      <p style="${SMALL_STYLE}">
        You can make a manual payment from your contributions page.
      </p>
    `),
  })
}
