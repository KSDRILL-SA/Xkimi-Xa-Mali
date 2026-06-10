import React from 'react'
import { View, Text, Svg, Path, Circle, Line, StyleSheet } from '@react-pdf/renderer'

// ─── Shared design tokens for all Xkimm Xa Mali PDF documents ──────────────────

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

// ─── Masthead & footer (shared across documents) ───────────────────────────────

const chrome = StyleSheet.create({
  masthead: {
    backgroundColor: C.headerBg, paddingHorizontal: 40, paddingTop: 26, paddingBottom: 24,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  monogram: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  monogramText: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.gold },
  orgName: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.paper, letterSpacing: 1.5 },
  orgTagline: { fontSize: 6.5, color: C.greenSoft, marginTop: 3, letterSpacing: 1.2, textTransform: 'uppercase' },
  mastRight: { alignItems: 'flex-end' },
  docType: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.paper, letterSpacing: 2.5, textTransform: 'uppercase' },
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
          <View style={chrome.monogram}><Text style={chrome.monogramText}>X</Text></View>
          <View>
            <Text style={chrome.orgName}>XKIMM XA MALI</Text>
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
      <Text style={chrome.fLeft}>XKIMM XA MALI</Text>
      <Text style={chrome.fCenter} render={({ pageNumber, totalPages }) => (
        `Confidential · ${docRef} · Page ${pageNumber} of ${totalPages}`
      )} />
      <Text style={chrome.fRight}>xkimimamali.co.za</Text>
    </View>
  )
}
