/**
 * Renders the Foundation's mark to PNG for use in email.
 *
 * Email cannot use the real logo the way the apps do. `XmmLogo` is a React
 * component and `brand/icon.svg` is SVG — no major email client renders inline
 * SVG, and Gmail strips it entirely. An earlier version of the email layout
 * worked around this by drawing a letter "X" out of a styled <div>, which is
 * why the emails carried a placeholder instead of the actual mark.
 *
 * A PNG served over HTTPS is the one form every client understands. Gmail,
 * Apple Mail and Outlook.com all load remote images by default (Gmail proxies
 * and caches them), and the clients that do not fall back to the alt text.
 *
 * Rendered at 3x the display size so it stays sharp on high-DPI screens, with
 * the alpha channel kept so the mark sits on the header's green without a box
 * around it.
 *
 * Run: node apps/web/scripts/render-brand-png.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(join(here, '../../../packages/ui/src/brand/icon.svg'))
const out = join(here, '../public/brand')

for (const size of [192, 384]) {
  const file = join(out, `logo-${size}.png`)
  await sharp(svg, { density: 600 }).resize(size, size).png({ compressionLevel: 9 }).toFile(file)
  console.log('wrote', file)
}
