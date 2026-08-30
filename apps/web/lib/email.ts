import { Resend } from 'resend'
import { escapeHtml } from '@xxm/utils'
import { env } from './env'
import { withRetry } from './retry'
import { ExternalServiceError } from './errors'

const FROM = env.RESEND_FROM_EMAIL
const APP_NAME = 'Xkimi Xa Mali Foundation'

// ─── Layout helpers ───────────────────────────────────────────────────────────

// Brand tokens, mirrored from packages/config/tailwind/base.ts. Duplicated
// deliberately: email HTML cannot reference a stylesheet or a CSS variable —
// every colour has to be a literal in an inline style attribute.
const BRAND = {
  green:     '#1B4332',
  greenDeep: '#052E16',
  gold:      '#D4AF37',
  ink:       '#111827',
  body:      '#374151',
  muted:     '#6B7280',
  faint:     '#9CA3AF',
  hairline:  '#E5E7EB',
  canvas:    '#F5F0E6',
  surface:   '#FFFFFF',
}

// This app's own public URL. `NEXTAUTH_URL` is the member portal's origin —
// the same value the auth callbacks and the CSRF allow-list use — so links in
// an email always point at the deployment that sent it.
const APP_URL     = env.NEXTAUTH_URL ?? 'https://member.xkimixamali.co.za'
const SITE_URL    = 'https://xkimixamali.co.za'
const SUPPORT     = env.SUPPORT_EMAIL
const WHATSAPP    = env.WHATSAPP_GROUP_LINK

const S = {
  heading: `margin:0 0 12px;color:${BRAND.green};font-size:22px;line-height:1.3;font-weight:800;`,
  body:    `margin:0 0 20px;color:${BRAND.body};font-size:15px;line-height:1.6;`,
  btn:     `display:inline-block;background:${BRAND.green};color:#ffffff;text-decoration:none;padding:14px 30px;border-radius:10px;font-weight:700;font-size:15px;`,
  small:   `margin:20px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.55;`,
  hr:      `border:none;border-top:1px solid ${BRAND.hairline};margin:28px 0;`,
  footer:  `margin:0;color:${BRAND.faint};font-size:12px;line-height:1.6;`,
  flink:   `color:${BRAND.green};text-decoration:none;font-weight:600;`,
  danger:  `background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:14px 16px;margin-top:20px;`,
  dtxt:    `margin:0;color:#991B1B;font-size:13px;font-weight:700;`,
  dbody:   `margin:8px 0 0;color:#7F1D1D;font-size:13px;line-height:1.55;`,
  // A URL printed as a fallback under a button, for clients that strip links
  // or recipients who do not trust one.
  rawUrl:  `margin:12px 0 0;color:${BRAND.faint};font-size:12px;line-height:1.5;word-break:break-all;`,
}

/**
 * The full branded shell every transactional email is rendered into.
 *
 * ── Why this is tables and inline styles ────────────────────────────────────
 *
 * Gmail strips `<style>` blocks, Outlook renders through Word's engine, and
 * neither supports flexbox or grid. Nested tables with inline attributes are
 * the only layout that survives across clients — this is not legacy code, it
 * is the constraint the medium imposes.
 *
 * The logo is drawn in HTML rather than referenced as an image on purpose:
 * most clients block remote images by default, so an `<img>` logo shows as a
 * broken placeholder on first open — the exact first impression a financial
 * platform cannot afford. A styled table cell always renders.
 *
 * `preheader` is the grey line clients show beside the subject in the inbox
 * list. Left unset it leaks whatever text comes first — usually "Verify your
 * email address" fragments — so every email sets one deliberately.
 */
function layout(content: string, preheader: string): string {
  return `
<div style="background:${BRAND.canvas};margin:0;padding:24px 12px;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="background:${BRAND.green};border-radius:16px 16px 0 0;padding:26px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width:46px;height:46px;background:${BRAND.greenDeep};border-radius:12px;text-align:center;vertical-align:middle;">
              <span style="color:${BRAND.gold};font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;line-height:46px;">X</span>
            </td>
            <td style="padding-left:14px;vertical-align:middle;">
              <div style="color:#ffffff;font-size:17px;font-weight:800;letter-spacing:-0.2px;">${APP_NAME}</div>
              <div style="color:${BRAND.gold};font-size:10px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;padding-top:3px;">Contributing · Growing · Securing</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.surface};padding:32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        ${content}
      </td>
    </tr>
    <tr>
      <td style="background:${BRAND.surface};border-radius:0 0 16px 16px;border-top:1px solid ${BRAND.hairline};padding:22px 28px 26px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <p style="margin:0 0 12px;font-size:13px;">
          <a href="${APP_URL}/dashboard" style="${S.flink}">Dashboard</a>
          <span style="color:${BRAND.hairline};padding:0 8px;">|</span>
          <a href="${APP_URL}/dashboard/contributions" style="${S.flink}">Contributions</a>
          <span style="color:${BRAND.hairline};padding:0 8px;">|</span>
          <a href="${SITE_URL}" style="${S.flink}">About</a>${
            WHATSAPP
              ? `<span style="color:${BRAND.hairline};padding:0 8px;">|</span><a href="${WHATSAPP}" style="${S.flink}">WhatsApp</a>`
              : ''
          }
        </p>
        <p style="${S.footer}">
          Questions? Reach us at <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a>.
        </p>
        <p style="${S.footer}margin-top:10px;">
          A private, invite-only savings collective. You are receiving this because you are a member of ${APP_NAME}.
        </p>
        <p style="${S.footer}margin-top:12px;color:${BRAND.faint};font-style:italic;">
          “Blessed is the hand that giveth.”
        </p>
      </td>
    </tr>
  </table>
</div>`
}

/** A button plus the same URL in plain text, for clients that strip links. */
function cta(url: string, label: string): string {
  return `<a href="${url}" style="${S.btn}">${label}</a>
    <p style="${S.rawUrl}">Or paste this into your browser:<br/>${url}</p>`
}

// ─── Retry-wrapped send ───────────────────────────────────────────────────────

async function send(
  options: Parameters<Resend['emails']['send']>[0],
  idempotencyKey?: string,
): Promise<void> {
  if (!env.RESEND_API_KEY) throw new ExternalServiceError('Resend', 'RESEND_API_KEY not configured')
  const resend = new Resend(env.RESEND_API_KEY)
  // An idempotency key makes both the internal retry above and a flush-worker
  // re-dispatch (after a crash-orphaned notification is recovered) safe: Resend
  // returns the original result instead of sending a second email.
  const sendOptions = idempotencyKey ? { idempotencyKey } : undefined
  await withRetry(
    async () => {
      const result = await resend.emails.send(options, sendOptions)
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
  const url = `${baseUrl}/api/v1/auth/verify-email?token=${token}`
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Verify your ${APP_NAME} account`,
    html: layout(`
      <h1 style="${S.heading}">Welcome, ${safeName}</h1>
      <p style="${S.body}">Your <strong>${APP_NAME}</strong> account has been created.
        Verify your email address to activate it.</p>
      ${cta(url, 'Verify email address')}
      <p style="${S.small}">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    `, `Verify your email to activate your ${APP_NAME} account.`),
  })
}

export async function sendPasswordResetEmail(
  to: string, firstName: string, token: string, baseUrl: string,
): Promise<void> {
  const url = `${baseUrl}/reset-password?token=${token}`
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Reset your ${APP_NAME} password`,
    html: layout(`
      <h1 style="${S.heading}">Reset your password</h1>
      <p style="${S.body}">Hi ${safeName}, we received a request to reset your <strong>${APP_NAME}</strong> password.</p>
      ${cta(url, 'Reset password')}
      <p style="${S.small}">This link expires in 1 hour and can only be used once. If you didn't request a reset, you can safely ignore this email — your password will not change.</p>
    `, 'Reset your password. This link expires in 1 hour.'),
  })
}

export async function sendWelcomeEmail(to: string, firstName: string, idempotencyKey?: string): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Welcome to ${APP_NAME}, ${firstName}!`,
    html: layout(`
      <h1 style="${S.heading}">Welcome, ${safeName}</h1>
      <p style="${S.body}">You are now a member of <strong>${APP_NAME}</strong>. Your account is
        active, and your first monthly contribution will be collected on your chosen debit date.</p>
      ${cta(`${APP_URL}/dashboard`, 'Go to your dashboard')}
      <p style="${S.body}margin-top:24px;">From your dashboard you can:</p>
      <p style="${S.body}margin:0;">
        • See every rand you have contributed, traceable to the day it moved<br/>
        • Download a statement at any time<br/>
        • Update your banking details and notification preferences<br/>
        • Follow the Goals the circle is saving toward together
      </p>
      <p style="${S.small}">Questions? Reply to this email or contact us at
        <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a>.</p>
    `, `Your ${APP_NAME} account is active.`),
  }, idempotencyKey)
}

export async function sendPaymentSuccessEmail(
  to: string, firstName: string, amount: string, period: string, idempotencyKey?: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Payment received — ${APP_NAME}`,
    html: layout(`
      <h1 style="${S.heading}">Payment received</h1>
      <p style="${S.body}">Hi ${safeName}, your contribution for <strong>${period}</strong> has been
        received. Thank you for keeping your account up to date.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${BRAND.canvas};border-radius:12px;padding:4px 18px;margin:0 0 22px;">
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.06);color:${BRAND.muted};font-size:14px;">Amount</td>
          <td style="padding:12px 0;border-bottom:1px solid rgba(0,0,0,0.06);color:${BRAND.green};font-weight:800;font-size:18px;text-align:right;">R${amount}</td>
        </tr>
        <tr>
          <td style="padding:12px 0;color:${BRAND.muted};font-size:14px;">Period</td>
          <td style="padding:12px 0;color:${BRAND.ink};font-weight:700;text-align:right;">${period}</td>
        </tr>
      </table>
      ${cta(`${APP_URL}/dashboard/contributions`, 'View your contributions')}
      <p style="${S.small}">This is your receipt — keep it for your records. A full statement is
        always available from your dashboard.</p>
    `, `Receipt: R${amount} received for ${period}.`),
  }, idempotencyKey)
}

export async function sendPaymentFailedEmail(
  to: string, firstName: string, amount: string, period: string, dashboardUrl: string, idempotencyKey?: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Action required — debit declined — ${APP_NAME}`,
    html: layout(`
      <h1 style="${S.heading}">Your debit was declined</h1>
      <p style="${S.body}">Hi ${safeName}, your <strong>R${amount}</strong> debit for
        <strong>${period}</strong> did not go through. This is usually an insufficient balance or a
        bank-side hold — it is not a mark against you, and it can be settled at any time.</p>
      ${cta(dashboardUrl, 'Settle this contribution')}
      <p style="${S.small}">Check that your banking details are current, or make a manual payment
        from your contributions page. Outstanding contributions remain due until settled.</p>
      <p style="${S.small}">If you believe this is an error, contact us at
        <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a>.</p>
    `, `Action needed: your R${amount} debit for ${period} was declined.`),
  }, idempotencyKey)
}

export async function sendInviteEmail(
  to: string, firstName: string, code: string, registrationUrl: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `You have been invited to join ${APP_NAME}`,
    html: layout(`
      <h1 style="${S.heading}">You have been invited, ${safeName}</h1>
      <p style="${S.body}">You have been invited to join <strong>${APP_NAME}</strong> — a private,
        invite-only savings collective. Membership is closed and capped; this invitation was issued
        to you personally.</p>
      <p style="${S.body}">Your one-time invite code:</p>
      <div style="background:${BRAND.canvas};border:1px solid rgba(212,175,55,0.35);border-radius:12px;padding:18px 24px;margin:0 0 22px;text-align:center;">
        <span style="font-size:26px;font-weight:800;letter-spacing:5px;color:${BRAND.green};font-family:'Courier New',Courier,monospace;">${code}</span>
      </div>
      ${cta(registrationUrl, 'Create my account')}
      <p style="${S.small}">Your code is filled in automatically when you use the button above.
        This invitation expires in <strong>7 days</strong>.</p>
      <div style="${S.danger}">
        <p style="${S.dtxt}">Security notice</p>
        <p style="${S.dbody}">This code is tied to your email address and phone number.
          <strong>Never share it with anyone</strong> — including anyone claiming to be from
          ${APP_NAME}, an admin, or offering to help you register. We will never ask you for it.</p>
        <p style="${S.dbody}">If you did not expect this invitation, ignore this email — the code
          cannot be used without your details.</p>
      </div>
    `, `Your personal invitation to join ${APP_NAME}.`),
  })
}

export async function sendOverdueReminderEmail(
  to: string, firstName: string, amount: string, period: string, dashboardUrl: string, idempotencyKey?: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Overdue contribution — ${APP_NAME}`,
    html: layout(`
      <h1 style="${S.heading}">A contribution is outstanding</h1>
      <p style="${S.body}">Hi ${safeName}, your <strong>R${amount}</strong> contribution for
        <strong>${period}</strong> is still outstanding. Settling it keeps your standing in the
        circle clear.</p>
      ${cta(dashboardUrl, 'Pay now')}
      <p style="${S.small}">You can pay in full or make a partial payment toward the balance —
        both are recorded against this period. If money is tight this month, speak to us at
        <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a> rather than going quiet.</p>
    `, `R${amount} outstanding for ${period}.`),
  }, idempotencyKey)
}

/**
 * Any templated or admin-composed email — broadcasts included.
 *
 * `body` is the message content only; it is wrapped in the same branded shell
 * as every other email here. It used to be dropped into a bare unstyled div,
 * so a broadcast arrived as black text on white with no logo, no links and no
 * indication it came from the Foundation at all.
 *
 * `body` must already be escaped/sanitised by the caller — `interpolateHtml`
 * in notification.service.ts does that for templated values. This function
 * cannot escape it wholesale, because a template's own markup is intentional.
 */
export async function sendGenericEmail(
  to: string,
  subject: string,
  body: string,
  idempotencyKey?: string,
  preheader?: string,
): Promise<void> {
  await send(
    { from: FROM, to, subject, html: layout(body, preheader ?? subject) },
    idempotencyKey,
  )
}
