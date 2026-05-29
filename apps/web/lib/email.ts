import { Resend } from 'resend'
import { env } from './env'
import { withRetry } from './retry'
import { ExternalServiceError } from './errors'

const resend = new Resend(env.RESEND_API_KEY)

const FROM = env.RESEND_FROM_EMAIL
const APP_NAME = 'Xkimm Xa Mali'

// ─── Layout helpers ───────────────────────────────────────────────────────────

const S = {
  base:    `font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;`,
  heading: `color:#1B4332;margin-bottom:8px;`,
  body:    `color:#374151;margin-bottom:24px;`,
  btn:     `display:inline-block;background:#1B4332;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;`,
  small:   `color:#6B7280;font-size:13px;margin-top:24px;`,
  hr:      `border:none;border-top:1px solid #E5E7EB;margin:32px 0;`,
  footer:  `color:#9CA3AF;font-size:12px;`,
  danger:  `background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin-top:20px;`,
  dtxt:    `margin:0;color:#991B1B;font-size:13px;font-weight:600;`,
  dbody:   `margin:8px 0 0;color:#7F1D1D;font-size:13px;`,
}

const TAGLINE = `${APP_NAME} · "Blessed is the hand that giveth."`

function layout(content: string): string {
  return `<div style="${S.base}">${content}<hr style="${S.hr}"/><p style="${S.footer}">${TAGLINE}</p></div>`
}

// ─── Retry-wrapped send ───────────────────────────────────────────────────────

async function send(options: Parameters<typeof resend.emails.send>[0]): Promise<void> {
  await withRetry(
    async () => {
      const result = await resend.emails.send(options)
      if (result.error) throw new Error(result.error.message)
    },
    { maxAttempts: 3, baseDelayMs: 1_000, label: `Email.send(${options.to})` },
  ).catch((err) => {
    throw new ExternalServiceError('Resend', err instanceof Error ? err.message : undefined)
  })
}

// ─── Transactional emails ─────────────────────────────────────────────────────

export async function sendVerificationEmail(
  to: string, firstName: string, token: string, baseUrl: string,
): Promise<void> {
  const url = `${baseUrl}/auth/verify-email?token=${token}`
  await send({
    from: FROM, to,
    subject: `Verify your ${APP_NAME} account`,
    html: layout(`
      <h1 style="${S.heading}">Welcome, ${firstName}!</h1>
      <p style="${S.body}">Your <strong>${APP_NAME}</strong> account has been created.
        Please verify your email address to activate it.</p>
      <a href="${url}" style="${S.btn}">Verify Email Address</a>
      <p style="${S.small}">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    `),
  })
}

export async function sendPasswordResetEmail(
  to: string, firstName: string, token: string, baseUrl: string,
): Promise<void> {
  const url = `${baseUrl}/auth/reset-password?token=${token}`
  await send({
    from: FROM, to,
    subject: `Reset your ${APP_NAME} password`,
    html: layout(`
      <h1 style="${S.heading}">Password Reset</h1>
      <p style="${S.body}">Hi ${firstName}, we received a request to reset your <strong>${APP_NAME}</strong> password.</p>
      <a href="${url}" style="${S.btn}">Reset Password</a>
      <p style="${S.small}">This link expires in 1 hour. If you didn't request a reset, you can safely ignore this email.</p>
    `),
  })
}

export async function sendWelcomeEmail(to: string, firstName: string): Promise<void> {
  await send({
    from: FROM, to,
    subject: `Welcome to ${APP_NAME}, ${firstName}!`,
    html: layout(`
      <h1 style="${S.heading}">Karibu, ${firstName}!</h1>
      <p style="${S.body}">You have been successfully registered with <strong>${APP_NAME}</strong>.
        Your account is active and your first monthly contribution will be collected on your designated debit date.</p>
      <p style="${S.body}">Log in at any time to view your contribution history, update your banking details,
        or track the group's financial goals.</p>
      <p style="${S.small}">If you have any questions, reach out to your group administrator.</p>
    `),
  })
}

export async function sendPaymentSuccessEmail(
  to: string, firstName: string, amount: string, period: string,
): Promise<void> {
  await send({
    from: FROM, to,
    subject: `Payment received — ${APP_NAME}`,
    html: layout(`
      <h1 style="${S.heading}">Payment Confirmed</h1>
      <p style="${S.body}">Hi ${firstName}, your <strong>R${amount}</strong> contribution for
        <strong>${period}</strong> has been processed successfully.
        Thank you for keeping your account up to date.</p>
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
  to: string, firstName: string, amount: string, period: string, dashboardUrl: string,
): Promise<void> {
  await send({
    from: FROM, to,
    subject: `Action required — debit declined — ${APP_NAME}`,
    html: layout(`
      <h1 style="${S.heading}">Payment Declined</h1>
      <p style="${S.body}">Hi ${firstName}, your <strong>R${amount}</strong> debit for
        <strong>${period}</strong> was not successful. Please log in and ensure your banking
        details are correct or arrange an alternative payment.</p>
      <a href="${dashboardUrl}" style="${S.btn}">Go to Dashboard</a>
      <p style="${S.small}">If you believe this is an error, contact your group administrator.
        Outstanding contributions accrue until settled.</p>
    `),
  })
}

export async function sendInviteEmail(
  to: string, firstName: string, code: string, registrationUrl: string,
): Promise<void> {
  await send({
    from: FROM, to,
    subject: `You have been invited to join ${APP_NAME}`,
    html: layout(`
      <h1 style="${S.heading}">You're Invited, ${firstName}!</h1>
      <p style="${S.body}">You have been invited to join <strong>${APP_NAME}</strong> — a secure
        group savings and contribution management platform.</p>
      <p style="${S.body}">Your one-time invite code is:</p>
      <div style="background:#F3F4F6;border-radius:8px;padding:16px 24px;margin:0 0 24px;text-align:center;">
        <span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#1B4332;font-family:monospace;">${code}</span>
      </div>
      <p style="${S.body}">Click the button below — your code will be filled in automatically.</p>
      <a href="${registrationUrl}" style="${S.btn}">Create My Account</a>
      <p style="${S.small}">This invitation expires in <strong>7 days</strong>.</p>
      <div style="${S.danger}">
        <p style="${S.dtxt}">🔒 Security notice</p>
        <p style="${S.dbody}">This code is personal to you and tied to your email address and phone number.
          <strong>Never share it with anyone</strong> — including ${APP_NAME} staff, admins, or anyone
          claiming to help you register.</p>
        <p style="${S.dbody}">If you did not expect this invitation, please ignore this email.</p>
      </div>
    `),
  })
}

export async function sendOverdueReminderEmail(
  to: string, firstName: string, amount: string, period: string, dashboardUrl: string,
): Promise<void> {
  await send({
    from: FROM, to,
    subject: `Overdue contribution — ${APP_NAME}`,
    html: layout(`
      <h1 style="${S.heading}">Contribution Overdue</h1>
      <p style="${S.body}">Hi ${firstName}, your <strong>R${amount}</strong> contribution for
        <strong>${period}</strong> is still outstanding. Please settle this as soon as possible
        to avoid any impact on your standing in the group.</p>
      <a href="${dashboardUrl}" style="${S.btn}">Pay Now</a>
      <p style="${S.small}">You can make a manual payment from your contributions page.</p>
    `),
  })
}
