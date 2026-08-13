import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Font } from '@react-pdf/renderer'

/**
 * The two things the guide loads off disk: its typefaces and the founders'
 * portraits.
 *
 * Both are done once per process and cached. A guide is generated on every
 * download, and neither re-reading four megabytes of PNG nor re-registering a
 * font family is work that needs doing twice.
 */

// ─── Typefaces ─────────────────────────────────────────────────────────────────

/**
 * Geist Sans, for everything that is not a display heading.
 *
 * The document was set in Helvetica, which is what @react-pdf gives you for
 * free. It is legible and it is not the voice of this Foundation — the first
 * edition used a proper geometric sans, and against it the built-in reads like
 * a fax. Geist is already a dependency of this repo.
 *
 * The files are vendored into `public/fonts` rather than read out of
 * `node_modules`. A monorepo hoists packages to wherever it likes and a
 * deployed server may not have the same layout as this machine; a path under
 * the app's own public directory is the same everywhere.
 *
 * Headings stay Times-Bold and Times-BoldItalic. That pairing — a high-contrast
 * serif running into its italic in gold — is the first edition's display voice,
 * and it is the part of the type that was already right.
 */
const FONT_DIR = join(process.cwd(), 'public', 'fonts')

let registered = false

export function registerGuideFonts(): void {
  if (registered) return
  Font.register({
    family: 'Geist',
    fonts: [
      { src: join(FONT_DIR, 'Geist-Regular.ttf'), fontWeight: 400 },
      { src: join(FONT_DIR, 'Geist-Medium.ttf'), fontWeight: 500 },
      { src: join(FONT_DIR, 'Geist-SemiBold.ttf'), fontWeight: 600 },
      { src: join(FONT_DIR, 'Geist-Bold.ttf'), fontWeight: 700 },
    ],
  })
  // Geist has no hyphenation dictionary here, and the default splitter breaks
  // words mid-syllable — "COM-MITMENT" on a stat tile. Off entirely: the
  // measures in this document are wide enough not to need it.
  Font.registerHyphenationCallback((word) => [word])
  registered = true
}

// ─── Portraits ─────────────────────────────────────────────────────────────────

export type Portrait = { data: Buffer; format: 'png' }

const portraits = new Map<string, Portrait>()

/**
 * A founder's portrait, downscaled to the size it is actually drawn at.
 *
 * The four source images are about 1.6 MB each at roughly 1100 x 1450, and the
 * largest the guide ever renders one is a little over 200pt wide. Embedded
 * whole they made a 6.8 MB document — for a file whose whole purpose is to be
 * sent to somebody.
 *
 * Resized to 640px on the long edge, which is comfortably above what 200pt at
 * print resolution needs, the same document is under a megabyte and looks
 * identical. The originals stay untouched in the repo; the website still uses
 * them at full size.
 *
 * Handed to `<Image>` as a buffer, never a path. Given a bare string
 * @react-pdf treats it as a URL and tries to fetch it, which in Node fails and
 * renders a hole — silently, because a missing image is not an error.
 */
export async function founderPhoto(file: string): Promise<Portrait> {
  const cached = portraits.get(file)
  if (cached) return cached

  const source = readFileSync(join(process.cwd(), 'public', 'founders', file))

  let data = source
  try {
    // Imported here rather than at module scope: sharp is a native module, and
    // a document should not fail to render because an image could not be made
    // smaller.
    const sharp = (await import('sharp')).default
    data = await sharp(source).resize({ width: 640, withoutEnlargement: true }).png({ quality: 90 }).toBuffer()
  } catch {
    // Fall back to the original. A larger file is a worse outcome than a
    // smaller one; no portrait at all is worse than both.
  }

  const p: Portrait = { data, format: 'png' }
  portraits.set(file, p)
  return p
}

/** All four, in the order they appear on the cover. */
export async function loadPortraits(files: string[]): Promise<Portrait[]> {
  return Promise.all(files.map(founderPhoto))
}
