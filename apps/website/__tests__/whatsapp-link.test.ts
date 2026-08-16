import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * The group's join link must never reach a public page.
 *
 * This is a private, invite-only collective of at most fifty people who know
 * each other. A `chat.whatsapp.com` invite admits anyone holding it to the group
 * where members discuss their money — so on the one app that faces the public,
 * it is not a link, it is a door left open.
 *
 * The route in is deliberately asymmetric: a visitor can *ask* an administrator
 * to be added, and the administrator decides. `adminWhatsAppUrl` builds that
 * request as a `wa.me` message to the admin's own number.
 *
 * It used to fall back to the invite when no admin number was configured.
 * Unreachable in practice — `lib/env` resolves that variable to a real value or
 * a placeholder and never to empty — but it was the invite one config change
 * away from being published, and it was not a degraded version of "ask an
 * administrator" so much as its opposite. Removed, and pinned here.
 *
 * The requirements document asks for the opposite of this. FR-WEB-003 and
 * FR-WEB-004 say the WhatsApp page and its deep link should be reachable without
 * authentication. That predates the decision to keep the circle closed and
 * would, if implemented, hand the group to anyone who found the site. The code
 * is right and the requirement is wrong; this is where that disagreement is
 * recorded, so nobody "fixes" the code to match the document.
 */

vi.mock('@/lib/env', () => ({
  siteEnv: {
    SITE_URL: 'http://site.test',
    APP_URL: 'http://member.test',
    ADMIN_URL: 'http://admin.test',
    WA_LINK: 'https://chat.whatsapp.com/SECRET-GROUP-INVITE',
    ADMIN_WA_NUMBER: '27820000000',
    SUPPORT_EMAIL: 'support@example.invalid',
  },
}))

beforeEach(() => vi.resetModules())

describe('the way in is a request, not a door', () => {
  it('sends the visitor to an administrator, not to the group', async () => {
    const { adminWhatsAppUrl } = await import('@/lib/utils')
    const url = adminWhatsAppUrl('Please add me.')

    expect(url).toContain('wa.me/27820000000')
    expect(url).not.toContain('chat.whatsapp.com')
  })

  it('carries the message, so the admin knows why they were written to', async () => {
    const { adminWhatsAppUrl } = await import('@/lib/utils')

    expect(adminWhatsAppUrl('Please add me.')).toContain(encodeURIComponent('Please add me.'))
  })

  it('does not re-export the invite into the public site utils', async () => {
    // Exporting it is what makes it easy to render by accident. It stays in
    // `siteEnv` for anything that legitimately needs it; nothing here does.
    const utils = await import('@/lib/utils')

    expect(Object.keys(utils)).not.toContain('WA_LINK')
  })
})

/**
 * A source scan, because the risk is somebody rendering the invite directly
 * rather than through the helper — which no amount of testing the helper catches.
 */
describe('no public source renders the group invite', () => {
  const ROOTS = ['app', 'components', 'lib'].map((d) => path.resolve(__dirname, '..', d))

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  /**
   * Comments are stripped before scanning. What matters is what the app
   * *renders*; a comment explaining why the invite must not be rendered is not a
   * leak. The first version of this case flagged the very comment documenting
   * the rule, which would have pushed the next person to delete the explanation
   * rather than keep the guard.
   */
  function codeOnly(src: string): string {
    const withoutBlocks = src.replace(/\/\*[\s\S]*?\*\//g, '')
    return withoutBlocks.replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  }

  it('never names WA_LINK or a chat.whatsapp.com URL outside lib/env', () => {
    const offenders: string[] = []

    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        // `lib/env` is where the value legitimately lives.
        if (file.endsWith(path.join('lib', 'env.ts'))) continue
        const src = codeOnly(readFileSync(file, 'utf8'))
        if (/\bWA_LINK\b/.test(src) || /chat\.whatsapp\.com/.test(src)) {
          offenders.push(path.relative(path.resolve(__dirname, '..'), file))
        }
      }
    }

    expect(offenders, `these could publish the group's invite:\n  ${offenders.join('\n  ')}`)
      .toEqual([])
  })
})
