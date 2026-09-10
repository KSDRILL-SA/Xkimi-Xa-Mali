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
  canvasSoft: '#FAF7F0',
  surface:   '#FFFFFF',
}

// This app's own public URL. `NEXTAUTH_URL` is the member portal's origin —
// the same value the auth callbacks and the CSRF allow-list use — so links in
// an email always point at the deployment that sent it.
const APP_URL     = env.NEXTAUTH_URL ?? 'https://member.xkimixamali.co.za'
const SITE_URL    = 'https://xkimixamali.co.za'
const SUPPORT     = env.SUPPORT_EMAIL
const WHATSAPP    = env.WHATSAPP_GROUP_LINK

const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`
const SERIF = `Georgia,'Times New Roman',serif`

/**
 * Type and component styles.
 *
 * Every key that existed before is kept, because each is referenced by name
 * from the individual email bodies further down this file — changing the
 * design means changing these values, not renaming the tokens.
 *
 * -- The pass that widened this scale ----------------------------------------
 *
 * The system was already sound — real hierarchy, a serif/sans pairing that
 * survives every client, a real list and a real details table instead of
 * bullet-character paragraphs. What it lacked was confidence: a 26px heading
 * reads as a large paragraph rather than a moment, and every block sat at the
 * same 22px gap regardless of how much it needed to be set apart from its
 * neighbour. `heading` gets a genuine hero size and a tighter line-height to
 * match; the eyebrow above it gets a touch more tracking, since a wider gap
 * between it and a bigger heading now needs a stronger, not weaker, label to
 * announce it. `h2` gets more air above it — 30px was barely more than a
 * paragraph gap for a line whose entire job is to say "new section here."
 */
const S = {
  // -- Type scale ------------------------------------------------------------
  eyebrow: `margin:0 0 12px;color:${BRAND.gold};font-size:11px;font-weight:800;letter-spacing:2px;text-transform:uppercase;`,
  heading: `margin:0 0 18px;color:${BRAND.green};font-family:${SERIF};font-size:30px;line-height:1.2;font-weight:700;letter-spacing:-0.4px;`,
  body:    `margin:0 0 24px;color:${BRAND.body};font-size:15px;line-height:1.7;`,
  lead:    `margin:0 0 26px;color:${BRAND.ink};font-size:16px;line-height:1.65;`,
  small:   `margin:24px 0 0;color:${BRAND.muted};font-size:13px;line-height:1.65;`,

  // A second heading level. There was only one, so an email with more than a
  // single idea in it had no way to say where the next one started.
  h2:      `margin:36px 0 14px;color:${BRAND.ink};font-size:15px;font-weight:800;letter-spacing:-0.1px;`,
  // List items as a real list. These used to be a single paragraph of bullet
  // characters separated by <br/>, which reads as one block of text and is
  // announced as one sentence by a screen reader.
  ul:      `margin:0 0 24px;padding:0 0 0 20px;color:${BRAND.body};font-size:15px;line-height:1.7;`,
  li:      `margin:0 0 9px;`,

  // -- Call to action --------------------------------------------------------
  // `mso-padding-alt` is ignored everywhere except Outlook, where it is the
  // only padding that applies to a link. Rounder and roomier than before —
  // 10px on a 15px/34px button reads as barely-rounded at email scale; 13px
  // is the point a pill-shaped button actually looks intentional rather than
  // like an un-styled link with padding.
  btn:     `display:inline-block;background:${BRAND.green};color:#ffffff;text-decoration:none;padding:16px 38px;border-radius:13px;font-weight:700;font-size:15px;line-height:1;letter-spacing:0.2px;mso-padding-alt:16px 38px;`,
  rawUrl:  `margin:16px 0 0;color:${BRAND.faint};font-size:12px;line-height:1.5;word-break:break-all;`,

  // -- Structural ------------------------------------------------------------
  hr:      `border:none;border-top:1px solid ${BRAND.hairline};margin:34px 0;`,
  panel:   `background:${BRAND.canvasSoft};border:1px solid ${BRAND.hairline};border-radius:12px;padding:20px 22px;margin:0 0 24px;`,
  panelLabel: `margin:0 0 4px;color:${BRAND.faint};font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;`,
  panelValue: `margin:0;color:${BRAND.ink};font-size:15px;font-weight:700;line-height:1.4;`,

  // -- Footer ----------------------------------------------------------------
  footer:  `margin:0;color:${BRAND.faint};font-size:12px;line-height:1.7;`,
  flink:   `color:${BRAND.green};text-decoration:none;font-weight:600;`,

  // -- Alert block -----------------------------------------------------------
  danger:  `background:#FEF2F2;border:1px solid #FECACA;border-left:4px solid #DC2626;border-radius:10px;padding:16px 18px;margin-top:24px;`,
  dtxt:    `margin:0;color:#991B1B;font-size:13px;font-weight:700;`,
  dbody:   `margin:8px 0 0;color:#7F1D1D;font-size:13px;line-height:1.6;`,
}

/**
 * The full branded shell every transactional email is rendered into.
 *
 * -- Why this is tables and inline styles ------------------------------------
 *
 * Gmail strips `<style>` blocks, Outlook renders through Word's engine, and
 * neither supports flexbox or grid. Nested tables with inline attributes are
 * the only layout that survives across clients — this is not legacy code, it
 * is the constraint the medium imposes. Every colour is a literal for the same
 * reason: there are no CSS variables to reference.
 *
 * -- The logo is the real mark, as a PNG --------------------------------------
 *
 * An earlier version of this shell drew a letter "X" in a styled table cell,
 * on the reasoning that clients block remote images and a broken placeholder
 * is a bad first impression. That traded a rare failure for a guaranteed one:
 * nobody ever saw the Foundation's actual logo, only a substitute letter.
 *
 * Gmail, Apple Mail and Outlook.com all load remote images by default now
 * (Gmail proxies and caches them), so the image is the common case, not the
 * exception. `alt` carries the organisation name for the clients that still
 * block it, and the header keeps its green background and wordmark either way
 * — so a blocked image costs the mark, not the branding.
 *
 * SVG is not an option: no major client renders inline SVG and Gmail strips
 * it. The PNG is rendered from `packages/ui/src/brand/icon.svg` by
 * `scripts/render-brand-png.mjs` at 192px and displayed at 48px, so it stays
 * sharp on high-DPI screens. It is served from this app's own `public/`
 * directory, which the proxy matcher excludes from auth, so the same deploy
 * that sends the email also serves the logo and the two cannot drift apart.
 *
 * `preheader` is the grey line clients show beside the subject in the inbox
 * list. Left unset it leaks whatever text comes first — usually a fragment of
 * the heading — so every email sets one deliberately.
 */
export function layout(content: string, preheader: string): string {
  return `
<div style="background:${BRAND.canvas};margin:0;padding:28px 12px;font-family:${FONT};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">

    <tr>
      <td style="background:${BRAND.green};border-radius:16px 16px 0 0;padding:26px 30px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle;" width="48">
              <img src="${APP_URL}/brand/logo-192.png" width="48" height="48" alt="${APP_NAME}"
                   style="display:block;border:0;outline:none;text-decoration:none;width:48px;height:48px;" />
            </td>
            <td style="padding-left:15px;vertical-align:middle;">
              <div style="color:#ffffff;font-family:${SERIF};font-size:18px;font-weight:700;letter-spacing:-0.2px;">${APP_NAME}</div>
              <div style="color:${BRAND.gold};font-size:10px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;padding-top:4px;">Contributing &middot; Growing &middot; Securing</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr><td style="background:${BRAND.gold};font-size:0;line-height:0;height:3px;">&nbsp;</td></tr>

    <tr>
      <td style="background:${BRAND.surface};padding:40px 32px 38px;font-family:${FONT};">
        ${content}
      </td>
    </tr>

    <tr>
      <td style="background:${BRAND.canvasSoft};border-radius:0 0 16px 16px;border-top:1px solid ${BRAND.hairline};padding:24px 30px 28px;font-family:${FONT};">
        <p style="margin:0 0 14px;font-size:13px;">
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
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:16px;">
          <tr><td style="border-top:1px solid ${BRAND.hairline};padding-top:14px;">
            <p style="${S.footer}font-family:${SERIF};font-style:italic;color:${BRAND.muted};">
              &ldquo;Blessed is the hand that giveth.&rdquo;
            </p>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</div>`
}

/**
 * A button plus the same URL in plain text, for clients that strip links.
 *
 * Wrapped in a table rather than left as a bare inline-block: Outlook ignores
 * padding on an `<a>`, so an unwrapped button collapses to underlined text
 * there. The table cell gives it real dimensions in every client.
 */
/**
 * The kind of email this is, above the heading.
 *
 * The type scale already had `eyebrow` and nothing used it. Every email opened
 * on a serif heading with no indication of what it was, so a payment receipt
 * and a password reset arrived looking identical until read. This is the line
 * that says which, in one word, before anybody reads a sentence.
 */
export function eyebrow(kind: string): string {
  return `<p style="${S.eyebrow}">${escapeHtml(kind)}</p>`
}

/**
 * The sentence under the heading that says what happened.
 *
 * Distinct from `body` on purpose — slightly larger and darker, because the
 * first line carries the whole message for somebody reading on a phone in a
 * notification shade. Everything after it is detail.
 */
export function lead(html: string): string {
  return `<p style="${S.lead}">${html}</p>`
}

/** A section heading, for an email with more than one idea in it. */
export function h2(text: string): string {
  return `<h2 style="${S.h2}">${escapeHtml(text)}</h2>`
}

/** A real list, rather than a paragraph of bullet characters. */
export function bullets(items: string[]): string {
  return `<ul style="${S.ul}">${items.map((i) => `<li style="${S.li}">${i}</li>`).join('')}</ul>`
}

/**
 * A labelled table of facts — an amount, a period, a reference.
 *
 * The payment emails each hand-rolled one of these inline, so the two drifted
 * in padding and border colour and neither could be improved without editing
 * both. The last row loses its rule, because a border under the final line
 * reads as an unfinished table.
 */
export function details(rows: Array<[label: string, value: string]>): string {
  const cells = rows.map(([label, value], i) => {
    const edge = i === rows.length - 1 ? '' : `border-bottom:1px solid ${BRAND.hairline};`
    return `<tr>
      <td style="padding:14px 0;${edge}color:${BRAND.muted};font-size:14px;">${escapeHtml(label)}</td>
      <td style="padding:14px 0;${edge}color:${BRAND.ink};font-weight:700;font-size:15px;text-align:right;">${value}</td>
    </tr>`
  }).join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${BRAND.canvasSoft};border:1px solid ${BRAND.hairline};border-radius:12px;padding:4px 20px;margin:0 0 24px;">${cells}</table>`
}

/** A horizontal rule before the fine print, so it reads as a footnote. */
export function divider(): string {
  return `<hr style="${S.hr}"/>`
}

/** The fine print: expiry, what to do if this was not you, who to contact. */
export function note(html: string): string {
  return `<p style="${S.small}">${html}</p>`
}

export function cta(url: string, label: string): string {
  // The wrapping `<td>`'s own radius has to match `S.btn`'s — it's the cell
  // that actually shows a corner in Outlook, where the `<a>`'s own
  // border-radius is ignored. Left at the old 10px while `S.btn` moved to
  // 13px, the two would show as two different curves stacked on each
  // other in exactly the client this table exists to support.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="background:${BRAND.green};border-radius:13px;">
        <a href="${url}" style="${S.btn}">${label}</a>
      </td>
    </tr></table>
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
      ${eyebrow('Confirm your email')}
      <h1 style="${S.heading}">Welcome, ${safeName}</h1>
      ${lead(`Your <strong>${APP_NAME}</strong> account has been created. One step left: confirm this is your address.`)}
      ${cta(url, 'Verify email address')}
      ${divider()}
      ${note('This link expires in 24 hours and can only be used once. If you did not create an account, you can ignore this email — nothing will be activated.')}
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
      ${eyebrow('Security')}
      <h1 style="${S.heading}">Reset your password</h1>
      ${lead(`Hi ${safeName}, we received a request to reset the password on your <strong>${APP_NAME}</strong> account.`)}
      ${cta(url, 'Reset password')}
      ${divider()}
      ${note('This link expires in 1 hour and can only be used once.')}
      ${note('<strong>If you did not ask for this</strong>, you can ignore this email — your password will not change, and nobody can use this link without access to your inbox.')}
    `, 'Reset your password. This link expires in 1 hour.'),
  })
}

export async function sendWelcomeEmail(to: string, firstName: string, idempotencyKey?: string): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Welcome to ${APP_NAME}, ${firstName}!`,
    html: layout(`
      ${eyebrow('Your account is active')}
      <h1 style="${S.heading}">Welcome, ${safeName}</h1>
      ${lead(`You are now a member of <strong>${APP_NAME}</strong>. Your first monthly contribution will be collected on your chosen debit date.`)}
      ${cta(`${APP_URL}/dashboard`, 'Go to your dashboard')}
      ${h2('What you can do from here')}
      ${bullets([
        'See every rand you have contributed, traceable to the day it moved',
        'Download a statement at any time',
        'Update your banking details and notification preferences',
        'Follow the Goals the circle is saving toward together',
      ])}
      ${divider()}
      ${note(`Questions? Reply to this email, or contact us at <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a>.`)}
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
      ${eyebrow('Receipt')}
      <h1 style="${S.heading}">Payment received</h1>
      ${lead(`Hi ${safeName}, your contribution for <strong>${period}</strong> has been received. Thank you for keeping your account up to date.`)}
      ${details([
        ['Amount', `<span style="color:${BRAND.green};font-size:18px;font-weight:800;">R${amount}</span>`],
        ['Period', escapeHtml(period)],
      ])}
      ${cta(`${APP_URL}/dashboard/contributions`, 'View your contributions')}
      ${divider()}
      ${note('This is your receipt — keep it for your records. A full statement is always available from your dashboard.')}
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
      ${eyebrow('Action needed')}
      <h1 style="${S.heading}">Your debit was declined</h1>
      ${lead(`Hi ${safeName}, the debit for <strong>${period}</strong> did not go through. This is usually an insufficient balance or a bank-side hold — it is not a mark against you, and it can be settled at any time.`)}
      ${details([
        ['Amount', `R${amount}`],
        ['Period', escapeHtml(period)],
        ['Status', '<span style="color:#B45309;">Declined — still outstanding</span>'],
      ])}
      ${cta(dashboardUrl, 'Settle this contribution')}
      ${h2('What to check')}
      ${bullets([
        'That your banking details on file are current',
        'That the account had funds on the debit date',
        'Or simply pay it from your contributions page instead',
      ])}
      ${divider()}
      ${note(`Outstanding contributions remain due until settled. If you believe this is an error, contact us at <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a>.`)}
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
      ${eyebrow('Invitation')}
      <h1 style="${S.heading}">You have been invited, ${safeName}</h1>
      ${lead(`You have been invited to join <strong>${APP_NAME}</strong> — a private, invite-only savings collective. Membership is closed and capped; this invitation was issued to you personally.`)}
      <p style="${S.panelLabel}">Your one-time invite code</p>
      <div style="background:${BRAND.canvas};border:1px solid rgba(212,175,55,0.35);border-radius:12px;padding:18px 24px;margin:0 0 22px;text-align:center;">
        <span style="font-size:26px;font-weight:800;letter-spacing:5px;color:${BRAND.green};font-family:'Courier New',Courier,monospace;">${code}</span>
      </div>
      ${cta(registrationUrl, 'Create my account')}
      ${note('Your code is filled in automatically when you use the button above. This invitation expires in <strong>7 days</strong>.')}
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
      ${eyebrow('Reminder')}
      <h1 style="${S.heading}">A contribution is outstanding</h1>
      ${lead(`Hi ${safeName}, your contribution for <strong>${period}</strong> is still outstanding. Settling it keeps your standing in the circle clear.`)}
      ${details([
        ['Outstanding', `<span style="color:${BRAND.green};font-size:18px;font-weight:800;">R${amount}</span>`],
        ['Period', escapeHtml(period)],
      ])}
      ${cta(dashboardUrl, 'Pay now')}
      ${divider()}
      ${note('You can pay in full or make a partial payment toward the balance — both are recorded against this period.')}
      ${note(`If money is tight this month, speak to us at <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a> rather than going quiet.`)}
    `, `R${amount} outstanding for ${period}.`),
  }, idempotencyKey)
}

/**
 * A reversal takes back money the member was already told had arrived —
 * the message they are most likely to need and least likely to expect, so
 * it says plainly that nothing was deleted: the original payment and the
 * reversing entry both stay on record. `MANDATORY_SLUGS` in
 * notification.service.ts backs that with a preference an opt-out cannot
 * silence, and this is the styled version of that promise rather than a
 * raw template string dropped into the shell unstyled.
 */
export async function sendContributionReversedEmail(
  to: string, firstName: string, amount: string, period: string, reason: string, url: string, idempotencyKey?: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `A payment has been reversed — ${APP_NAME}`,
    html: layout(`
      ${eyebrow('Reversal')}
      <h1 style="${S.heading}">A payment has been reversed</h1>
      ${lead(`Hi ${safeName}, your contribution for <strong>${period}</strong> has been reversed by leadership. Nothing has been deleted — the original payment and the reversing entry both remain in your history.`)}
      ${details([
        ['Amount', `R${amount}`],
        ['Period', escapeHtml(period)],
        ['Reason given', escapeHtml(reason)],
      ])}
      ${cta(url, 'View your history')}
      ${divider()}
      ${note(`Questions about this reversal? Contact us at <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a>.`)}
    `, `A R${amount} contribution for ${period} has been reversed.`),
  }, idempotencyKey)
}

/**
 * A member's own standing statement, ready to download. Distinct from
 * `sendGenericEmail`'s bare template path: this is genuinely queued news
 * rather than money moving (`MANDATORY_SLUGS`'s own comment draws that
 * line), so it earns the same eyebrow/heading treatment as a receipt
 * without implying anything urgent the way a payment email's styling would.
 */
export async function sendStatementReadyEmail(
  to: string, firstName: string, period: string, url: string, idempotencyKey?: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Your ${period} statement is ready — ${APP_NAME}`,
    html: layout(`
      ${eyebrow('Statement ready')}
      <h1 style="${S.heading}">Your statement is ready</h1>
      ${lead(`Hi ${safeName}, your contribution statement for <strong>${period}</strong> is ready to download.`)}
      ${cta(url, 'Download your statement')}
      ${divider()}
      ${note('Every statement stays available from your dashboard at any time — this one is not time-limited.')}
    `, `Your ${period} statement is ready to download.`),
  }, idempotencyKey)
}

/** `AMATEUR` / `SEMI_PRO` / `WORLD_CLASS` → `Amateur` / `Semi Pro` / `World Class`. */
function formatTier(tier: string): string {
  return tier
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * A promotion, earned by consistent contributions rather than announced by
 * an admin — the one piece of good news this system sends unprompted, and
 * the styled version is the difference between that landing as a genuine
 * moment and as the same grey paragraph as every other notification.
 */
export async function sendBadgeLevelUpEmail(
  to: string, firstName: string, tier: string, idempotencyKey?: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  const tierLabel = formatTier(tier)
  await send({
    from: FROM, to,
    subject: `You have been promoted — ${APP_NAME}`,
    html: layout(`
      ${eyebrow('Promotion')}
      <h1 style="${S.heading}">You have been promoted</h1>
      ${lead(`Hi ${safeName}, congratulations! Your consistent contributions have earned you <strong>${escapeHtml(tierLabel)}</strong> status.`)}
      ${cta(`${APP_URL}/dashboard`, 'View your dashboard')}
      ${divider()}
      ${note('Badge status reflects consistency and timeliness over time — keep contributing on schedule to hold it.')}
    `, `You have been promoted to ${tierLabel} status.`),
  }, idempotencyKey)
}

/**
 * A founder badge is granted by hand, so it appears on an account without
 * the member having done anything — unannounced, that reads as a bug
 * rather than an honour. Email only, per the badge's own original intent:
 * it is not money moving and not urgent.
 */
export async function sendFounderBadgeGrantedEmail(
  to: string, firstName: string, idempotencyKey?: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  await send({
    from: FROM, to,
    subject: `Your Founder badge — ${APP_NAME}`,
    html: layout(`
      ${eyebrow('Founder badge')}
      <h1 style="${S.heading}">A Founder badge, for you</h1>
      ${lead(`Hi ${safeName}, the Founder badge has been added to your account. It marks you as one of the four who started this collective.`)}
      ${bullets([
        'It sits alongside whatever contribution badge you have earned — it does not replace it',
        'It stays with your account for good, regardless of how your contribution badge changes',
      ])}
      ${cta(`${APP_URL}/dashboard`, 'View your dashboard')}
    `, 'The Founder badge has been added to your account.'),
  }, idempotencyKey)
}

/**
 * Operational alerts to leadership — not a member notification. Deliberately
 * plainer than the emails above it: no greeting (it is not addressed to a
 * person, it is addressed to whoever is on call), and `detail` renders as
 * real paragraphs the same way a broadcast's composer text does, since an
 * alert's detail is free text that may carry its own line breaks.
 */
export async function sendAdminAlertEmail(
  to: string, title: string, detail: string, idempotencyKey?: string,
): Promise<void> {
  const paragraphs = detail
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${S.body}">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('') || `<p style="${S.body}">${escapeHtml(detail)}</p>`

  await send({
    from: FROM, to,
    subject: `Action needed: ${title}`,
    html: layout(`
      ${eyebrow('Operational alert')}
      <h1 style="${S.heading}">${escapeHtml(title)}</h1>
      ${paragraphs}
      ${divider()}
      ${note(`This is an automated operational alert from the ${APP_NAME} system. Full detail is in your admin inbox.`)}
    `, title),
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
/**
 * A message leadership wrote, sent to the membership.
 *
 * It had no email of its own. The broadcast built its own markup inline in
 * `admin.service.ts` — a bare `<div style="font-family:sans-serif">` with grey
 * paragraphs — and handed it to `sendGenericEmail`, which wrapped that in the
 * branded shell. So the one email a member is most likely to actually read was
 * the only one that used none of the type system: no eyebrow, no heading, no
 * hierarchy, and its own padding nested inside the shell's.
 *
 * The subject was the constant string "Message from Xkimi Xa Mali Foundation"
 * on every send, which tells a member nothing about which message this is and
 * makes two broadcasts indistinguishable in an inbox list.
 *
 * `subject` is now written by whoever sends it and does three jobs: the email
 * subject, the heading, and the preheader line beside it in the inbox.
 */
export async function sendBroadcastEmail(
  to: string,
  firstName: string,
  subject: string,
  message: string,
  idempotencyKey?: string,
): Promise<void> {
  const safeName = escapeHtml(firstName)
  // Paragraph breaks survive as paragraphs. The composer is a textarea, so what
  // somebody types as two thoughts should not arrive as one block.
  const paragraphs = message
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="${S.body}">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('')

  await send({
    from: FROM, to,
    subject,
    html: layout(`
      ${eyebrow('Announcement')}
      <h1 style="${S.heading}">${escapeHtml(subject)}</h1>
      ${lead(`Hi ${safeName},`)}
      ${paragraphs}
      ${divider()}
      ${note(`Sent to members of ${APP_NAME}. Reply to this email or contact <a href="mailto:${SUPPORT}" style="${S.flink}">${SUPPORT}</a> if you have a question.`)}
    `, subject),
  }, idempotencyKey)
}

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
