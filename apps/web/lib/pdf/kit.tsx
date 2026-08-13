import React from 'react'
import {
  View, Text, Svg, Path, Circle, Line, Rect, Polygon, G,
  Defs, LinearGradient, RadialGradient, Stop, StyleSheet,
} from '@react-pdf/renderer'
// Printed on every generated document. Derived from the configured site URL
// rather than written in, so a statement can never carry a domain the
// foundation no longer owns.
//
// Read when a footer is rendered rather than when this module is imported. The
// palette and the mark live in here too, and a document that uses those but no
// footer — the Founder Guide is one — should not have to satisfy the whole
// environment schema to be drawn.
function siteHost(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  if (!raw) return 'xkimmxamali.co.za'
  try {
    return new URL(raw).host
  } catch {
    // A malformed URL is a configuration problem, not a reason to refuse
    // somebody their statement. `lib/env` validates this at boot; here it is a
    // string on a footer.
    return raw
  }
}

// ─── Shared design tokens for all Xkimm Xa Mali Foundation PDF documents ──────────────────

export const C = {
  ink:       '#0A1F17',
  headerBg:  '#0C2A1E',
  green:     '#16412F',
  greenMid:  '#2D6A4F',
  greenSoft: '#5B8A74',
  mist:      '#F4F8F6',
  mistLine:  '#E3EEE8',
  gold:      '#B98A1F',
  goldSoft:  '#FBF4E2',
  paper:     '#FFFFFF',
  // The page itself, warmer than the cards that sit on it — matching the
  // Founder Guide rather than the flat white a browser would print.
  canvas:    '#FBFAF6',
  line:      '#E7EBE9',
  lineSoft:  '#F1F4F3',
  ink70:     '#3B4A44',
  ink50:     '#6A7872',
  ink35:     '#9AA6A1',
  red:       '#C2410C',
  redSoft:   '#FBEAE1',
  amber:     '#B45309',
  amberSoft: '#FBF1E0',
  sky:       '#0E7490',
  skySoft:   '#E3F1F4',
  ok:        '#15795B',
  okSoft:    '#E2F1EB',
}

// ─── Money formatting ──────────────────────────────────────────────────────────

export function rands(amount: number): string {
  return `R ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

// ─── Icons (lucide-style, stroked SVG) ─────────────────────────────────────────

export type IconProps = { size?: number; color?: string }

function Stroke({ children, size = 10, color = C.gold }: IconProps & { children: React.ReactNode }) {
  // Apply presentation attributes to every shape so rendering doesn't depend on
  // SVG attribute inheritance (which @react-pdf handles inconsistently).
  const shapeProps = {
    stroke: color, strokeWidth: 2, fill: 'none',
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, shapeProps)
          : child,
      )}
    </Svg>
  )
}

export const IconUser = (p: IconProps) => (
  <Stroke {...p}><Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" /></Stroke>
)
export const IconUsers = (p: IconProps) => (
  <Stroke {...p}><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><Circle cx="9" cy="7" r="4" /><Path d="M22 21v-2a4 4 0 0 0-3-3.87" /><Path d="M16 3.13a4 4 0 0 1 0 7.75" /></Stroke>
)
export const IconFile = (p: IconProps) => (
  <Stroke {...p}><Path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><Path d="M14 2v4a2 2 0 0 0 2 2h4" /><Line x1="8" y1="13" x2="16" y2="13" /><Line x1="8" y1="17" x2="16" y2="17" /></Stroke>
)
export const IconBank = (p: IconProps) => (
  <Stroke {...p}><Line x1="3" y1="22" x2="21" y2="22" /><Line x1="6" y1="18" x2="6" y2="11" /><Line x1="10" y1="18" x2="10" y2="11" /><Line x1="14" y1="18" x2="14" y2="11" /><Line x1="18" y1="18" x2="18" y2="11" /><Path d="M12 2 21 7 3 7 Z" /></Stroke>
)
export const IconWallet = (p: IconProps) => (
  <Stroke {...p}><Path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5" /><Path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /><Circle cx="17" cy="14" r="1" /></Stroke>
)
export const IconCoins = (p: IconProps) => (
  <Stroke {...p}><Circle cx="8" cy="8" r="6" /><Path d="M18.09 10.37A6 6 0 1 1 10.34 18" /><Path d="M7 6h1v4" /><Path d="m16.71 13.88.7.71-2.82 2.82" /></Stroke>
)
export const IconScale = (p: IconProps) => (
  <Stroke {...p}><Path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><Path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /><Path d="M7 21h10" /><Path d="M12 3v18" /><Path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" /></Stroke>
)
export const IconShield = (p: IconProps) => (
  <Stroke {...p}><Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z" /><Path d="m9 12 2 2 4-4" /></Stroke>
)
export const IconTrending = (p: IconProps) => (
  <Stroke {...p}><Path d="M16 7h6v6" /><Path d="m22 7-8.5 8.5-5-5L2 17" /></Stroke>
)
export const IconChart = (p: IconProps) => (
  <Stroke {...p}><Line x1="12" y1="20" x2="12" y2="10" /><Line x1="18" y1="20" x2="18" y2="4" /><Line x1="6" y1="20" x2="6" y2="16" /></Stroke>
)

// ─── Status pill ───────────────────────────────────────────────────────────────

type Tone = { bg: string; fg: string; dot: string }
export function statusTone(status: string): Tone {
  switch (status.toUpperCase()) {
    case 'PAID': case 'SUCCESS':           return { bg: C.okSoft,    fg: C.ok,    dot: C.ok }
    case 'PENDING': case 'PROCESSING':     return { bg: C.amberSoft, fg: C.amber, dot: C.amber }
    case 'OVERDUE': case 'FAILED': case 'REVERSED': return { bg: C.redSoft, fg: C.red, dot: C.red }
    case 'PARTIAL':                        return { bg: C.skySoft,   fg: C.sky,   dot: C.sky }
    case 'WAIVED':                         return { bg: C.lineSoft,  fg: C.ink50, dot: C.ink35 }
    default:                               return { bg: C.lineSoft,  fg: C.ink50, dot: C.ink35 }
  }
}

const pill = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 4 },
  text: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4 },
})

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const t = statusTone(status)
  return (
    <View style={[pill.wrap, { backgroundColor: t.bg }]}>
      <View style={[pill.dot, { backgroundColor: t.dot }]} />
      <Text style={[pill.text, { color: t.fg }]}>{(label ?? status).toUpperCase()}</Text>
    </View>
  )
}

// ─── The mark ──────────────────────────────────────────────────────────────────

/**
 * The Foundation's actual logo, drawn as vector.
 *
 * Every generated document carried a letter X in a gold circle — a placeholder
 * standing in for a mark that already exists and is used everywhere else in the
 * product. A statement is the one artefact a member keeps, forwards, and may
 * hand to a bank; it should not be the only place the Foundation appears under
 * a substitute.
 *
 * Redrawn from `packages/ui` rather than embedded as an image, so it stays
 * sharp at any size and adds nothing to the file. The colours are the brand's
 * own, deliberately not the print-adjusted gold used for rules and labels —
 * this is the logo, not a decoration tinted to match the page.
 */
const MARK = {
  gold: '#D4AF37',
  goldLight: '#F5D76E',
  goldDark: '#8B6914',
  goldMid: '#BF9B30',
  green: '#1B4332',
  canopy: '#2C5F47',
}

export function XmmMark({ size = 34 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="mkRing" x1="25%" y1="0%" x2="75%" y2="100%">
          <Stop offset="0%" stopColor={MARK.goldLight} />
          <Stop offset="40%" stopColor={MARK.gold} />
          <Stop offset="100%" stopColor={MARK.goldDark} />
        </LinearGradient>
        <RadialGradient id="mkDisc" cx="38%" cy="32%" r="68%">
          <Stop offset="0%" stopColor={MARK.canopy} />
          <Stop offset="100%" stopColor={MARK.green} />
        </RadialGradient>
        <LinearGradient id="mkArrow" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={MARK.goldLight} />
          <Stop offset="55%" stopColor={MARK.gold} />
          <Stop offset="100%" stopColor={MARK.goldMid} />
        </LinearGradient>
        <LinearGradient id="mkBar" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={MARK.goldLight} />
          <Stop offset="100%" stopColor={MARK.gold} />
        </LinearGradient>
      </Defs>

      {/* Coin rim, then the green face it holds */}
      <Circle cx="50" cy="50" r="49" fill="url(#mkRing)" />
      <Circle cx="50" cy="50" r="45" fill="none" stroke={MARK.goldDark} strokeWidth={0.6} strokeOpacity={0.5} />
      <Circle cx="50" cy="50" r="43" fill="url(#mkDisc)" />

      {/* Two arrows crossed — money moving both ways within the circle */}
      <G transform="translate(50,50) rotate(45)">
        <Polygon
          points="-30,0 -20,-8.5 -20,-3.5 20,-3.5 20,-8.5 30,0 20,8.5 20,3.5 -20,3.5 -20,8.5"
          fill={MARK.canopy}
          fillOpacity={0.85}
        />
      </G>
      <G transform="translate(50,50) rotate(-45)">
        <Polygon
          points="-30,0 -20,-8.5 -20,-3.5 20,-3.5 20,-8.5 30,0 20,8.5 20,3.5 -20,3.5 -20,8.5"
          fill="url(#mkArrow)"
        />
        <Polygon points="-30,0 -20,-8.5 -20,-6 20,-6 20,-8.5 30,0" fill={MARK.goldLight} fillOpacity={0.22} />
      </G>

      {/* Growth */}
      <Rect x="36.5" y="19" width="4.2" height="8.5" rx="1.2" fill="url(#mkBar)" fillOpacity={0.6} />
      <Rect x="42.5" y="16" width="4.2" height="11.5" rx="1.2" fill="url(#mkBar)" fillOpacity={0.75} />
      <Rect x="48.5" y="12.5" width="4.2" height="15" rx="1.2" fill="url(#mkBar)" />
      <Rect x="54.5" y="16.5" width="4.2" height="11" rx="1.2" fill="url(#mkBar)" fillOpacity={0.7} />

      {/* Medallion: the rand, and the handshake under it */}
      <Circle cx="50" cy="50" r="14" fill={MARK.green} />
      <Circle cx="50" cy="50" r="13" fill="none" stroke={MARK.gold} strokeWidth={1.8} />
      <Circle cx="50" cy="50" r="11.5" fill="none" stroke={MARK.goldLight} strokeWidth={0.4} strokeOpacity={0.3} />
      <Text x={50} y={55.5} textAnchor="middle" fill={MARK.gold} style={{ fontFamily: 'Times-Bold', fontSize: 15 }}>
        R
      </Text>
      <Path
        d="M45.5 60 Q50 63.5 54.5 60"
        stroke={MARK.gold}
        strokeWidth={1.4}
        strokeOpacity={0.6}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// ─── Masthead & footer (shared across documents) ───────────────────────────────

const chrome = StyleSheet.create({
  masthead: {
    backgroundColor: C.headerBg, paddingHorizontal: 40, paddingTop: 26, paddingBottom: 24,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  // flex + paddingRight so a long org name cannot run into the document
  // title beside it. At 17pt with 1.5 letter-spacing it did exactly that:
  // "FOUNDATION" and "STATEMENT OF ACCOUNT" touched with no gap at all.
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, paddingRight: 16 },
  orgName: { fontSize: 14.5, fontFamily: 'Times-Bold', color: C.paper, letterSpacing: 1.1 },
  orgTagline: { fontSize: 6.5, color: C.greenSoft, marginTop: 3, letterSpacing: 1.2, textTransform: 'uppercase' },
  mastRight: { flexShrink: 0, alignItems: 'flex-end' },
  docType: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.paper, letterSpacing: 2.5, textTransform: 'uppercase' },
  docPeriod: { fontSize: 8.5, color: C.gold, marginTop: 5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  docRef: { fontSize: 6.5, color: C.ink35, marginTop: 3, letterSpacing: 0.5 },
  accentBar: { height: 3, backgroundColor: C.gold },
  accentBarShade: { height: 1.5, backgroundColor: C.greenMid },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopWidth: 2, borderTopColor: C.gold, backgroundColor: C.headerBg,
    paddingHorizontal: 40, paddingVertical: 9,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  fLeft: { fontSize: 6.5, color: C.greenSoft, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  fCenter: { fontSize: 6, color: C.ink35, letterSpacing: 0.3 },
  fRight: { fontSize: 6.5, color: C.greenSoft, letterSpacing: 0.3 },
})

export function Masthead({ docType, period, docRef }: { docType: string; period: string; docRef: string }) {
  return (
    <>
      <View style={chrome.masthead} fixed>
        <View style={chrome.brandRow}>
          <XmmMark size={34} />
          <View>
            <Text style={chrome.orgName}>XKIMM XA MALI FOUNDATION</Text>
            <Text style={chrome.orgTagline}>Contributing · Growing · Securing</Text>
          </View>
        </View>
        <View style={chrome.mastRight}>
          <Text style={chrome.docType}>{docType}</Text>
          <Text style={chrome.docPeriod}>{period}</Text>
          <Text style={chrome.docRef}>REF {docRef}</Text>
        </View>
      </View>
      <View style={chrome.accentBar} fixed />
      <View style={chrome.accentBarShade} fixed />
    </>
  )
}

export function PageFooter({ docRef }: { docRef: string }) {
  return (
    <View style={chrome.footer} fixed>
      <Text style={chrome.fLeft}>XKIMM XA MALI FOUNDATION</Text>
      <Text style={chrome.fCenter} render={({ pageNumber, totalPages }) => (
        `Confidential · ${docRef} · Page ${pageNumber} of ${totalPages}`
      )} />
      <Text style={chrome.fRight}>{siteHost()}</Text>
    </View>
  )
}
