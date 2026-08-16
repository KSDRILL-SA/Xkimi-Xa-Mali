import { ImageResponse } from 'next/og'
import { FACTS } from '@/lib/facts'

/**
 * The card people see when the site is shared.
 *
 * `twitter.card` in the root layout is `summary_large_image`, which promises
 * one; there was none, so every share — and WhatsApp is how this Foundation
 * actually circulates — rendered as a bare grey text stub. For a site whose only
 * job is a first impression, that was the first impression.
 *
 * Generated rather than a committed PNG so the wording stays in one place with
 * the rest of the brand copy. Generation is what broke the favicon: Satori
 * produced a buffer `sharp` could not read at 32x32. This is 1200x630, the size
 * the member app already generates successfully, and it is verified rather than
 * assumed — a social card that 500s is invisible in exactly the moment it
 * matters, because the platform silently falls back to nothing.
 *
 * Every element carries an explicit `display: 'flex'`: Satori requires it on
 * anything with more than one child and fails obscurely without it.
 *
 * The type renders sans-serif, not the brand's Playfair. Satori only embeds
 * fonts it is handed as TTF or OTF and the repository carries Playfair as woff2,
 * which it cannot parse — so the `fontFamily` below is a preference that will
 * not be honoured until someone adds a TTF. It is left stated rather than
 * removed so the next person knows it was a constraint and not an oversight. The
 * result is clean and legible, which for a share card is the whole job.
 */

export const runtime = 'nodejs'
export const alt = 'Xkimm Xa Mali Foundation — Contributing. Growing. Securing.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: 88,
          background: 'linear-gradient(135deg, #052E16 0%, #1B4332 55%, #14532D 100%)',
          fontFamily: 'Georgia, serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 44 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 68,
              height: 68,
              borderRadius: 20,
              background: '#D4AF37',
              color: '#052E16',
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            X
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 26,
              letterSpacing: 6,
              color: '#D4AF37',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            FOUNDATION
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 82, color: '#FFFFFF', lineHeight: 1.1 }}>
            Contributing. Growing.
          </div>
          <div style={{ display: 'flex', fontSize: 82, color: '#D4AF37', lineHeight: 1.1 }}>
            Securing.
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 40,
            fontSize: 28,
            color: 'rgba(255,255,255,0.66)',
            fontFamily: 'system-ui, sans-serif',
            maxWidth: 860,
          }}
        >
          {`A private savings collective, built by ${FACTS.founderWord} brothers for the people closest to them.`}
        </div>
      </div>
    ),
    { ...size },
  )
}
