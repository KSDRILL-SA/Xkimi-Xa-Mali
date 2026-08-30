/**
 * Renders the branded email shell to a local HTML file so the layout can be
 * looked at without sending anything.
 *
 * Email is the one surface with no dev server and no hot reload — the only way
 * to see a change is to send it to a real inbox, which is slow and burns
 * deliverability reputation on test sends. This renders the same `layout()`
 * the live emails use, so what opens in the browser is what Resend delivers.
 *
 * Run: npm run render:email -w @xxm/web
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { layout, cta } from '../lib/email'

const S = {
  heading: 'margin:0 0 14px;color:#1B4332;font-family:Georgia,serif;font-size:26px;line-height:1.25;font-weight:700;',
  body: 'margin:0 0 22px;color:#374151;font-size:15px;line-height:1.65;',
  small: 'margin:22px 0 0;color:#6B7280;font-size:13px;line-height:1.6;',
  panel: 'background:#FAF7F0;border:1px solid #E5E7EB;border-radius:12px;padding:18px 20px;margin:0 0 22px;',
  panelLabel: 'margin:0 0 4px;color:#9CA3AF;font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;',
  panelValue: 'margin:0;color:#111827;font-size:15px;font-weight:700;line-height:1.4;',
}

const html = layout(
  `
  <p style="margin:0 0 10px;color:#D4AF37;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">Payment received</p>
  <h1 style="${S.heading}">Thank you, Kurhula</h1>
  <p style="${S.body}">Your monthly contribution has been received and applied to your
    <strong>August 2026</strong> period. Your statement has been updated.</p>

  <div style="${S.panel}">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="50%" style="padding-bottom:14px;">
          <p style="${S.panelLabel}">Amount</p>
          <p style="${S.panelValue}">R 500,00</p>
        </td>
        <td width="50%" style="padding-bottom:14px;">
          <p style="${S.panelLabel}">Period</p>
          <p style="${S.panelValue}">August 2026</p>
        </td>
      </tr>
      <tr>
        <td width="50%">
          <p style="${S.panelLabel}">Reference</p>
          <p style="${S.panelValue}">XXM-2026-08-4417</p>
        </td>
        <td width="50%">
          <p style="${S.panelLabel}">Status</p>
          <p style="${S.panelValue}">Settled</p>
        </td>
      </tr>
    </table>
  </div>

  ${cta('https://member.xkimixamali.co.za/dashboard/contributions', 'View your contributions')}

  <p style="${S.small}">This is a record of a payment collected by debit order. If you did not
    expect it, contact us before your next debit date.</p>
  `,
  'Your R 500,00 contribution for August 2026 has been received.',
)

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '../.render')
mkdirSync(out, { recursive: true })
const file = join(out, 'email-preview.html')
writeFileSync(file, html, 'utf8')
console.log('wrote', file)
