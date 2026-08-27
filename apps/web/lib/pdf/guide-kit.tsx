import React from 'react'
import {
  View, Text, Image, Svg, Path, Circle, Rect, G as SvgG,
  Defs, LinearGradient, Stop, StyleSheet,
} from '@react-pdf/renderer'
import { XmmMark } from './kit'
import type { Portrait } from './guide-assets'

/**
 * The Founder Guide's design system.
 *
 * ── What this is a rebuild of ───────────────────────────────────────────────
 *
 * The first edition is a beautiful document, and the second edition briefly was
 * not: it was rebuilt from nothing in plain type, which lost the guilloche
 * cover, the founders' portraits, the dark panels carrying the two statements
 * that matter most, and the whole two-tone display voice. It also began
 * describing the system in the system's own words — file names and all — to
 * four people who do not work in software.
 *
 * So this is the first edition's design language rebuilt properly and extended,
 * not a replacement for it. Every device below is taken from that document: the
 * ghost numeral in the corner, the green tab on the outer edge, the gold
 * diamond opening a kicker, the gradient rule under the running head, the dark
 * hero panel, the three tinted advice boxes, the stat tiles, the journey rail.
 *
 * ── One section, one page ───────────────────────────────────────────────────
 *
 * The first edition gives each section exactly one page, which is why its
 * contents can print real page numbers and why nothing trails onto a half-empty
 * leaf. That constraint is kept, and the page numbers are computed from the
 * same structure the document is built from, so the contents cannot point at
 * the wrong page.
 */

// ─── Palette ───────────────────────────────────────────────────────────────────

export const G = {
  night:      '#0B2E20',
  nightDeep:  '#071B12',
  nightLift:  '#12452F',

  page:       '#FDFCF7',
  paper:      '#FFFFFF',

  ink:        '#1A2721',
  ink70:      '#3D4A44',
  ink50:      '#6B7772',
  ink35:      '#9BA5A0',

  green:      '#14432F',
  greenMid:   '#2D6A4F',
  greenSoft:  '#7FA894',
  greenPale:  '#EDF6F1',
  greenLine:  '#BFDCCB',

  gold:       '#C9A227',
  goldLight:  '#E8CC72',
  goldDeep:   '#8B6914',
  goldPale:   '#FDF6E9',
  goldLine:   '#E5C07B',
  goldInk:    '#8A6A1F',

  rose:       '#C2410C',
  rosePale:   '#FCF0EC',
  roseLine:   '#EFCFC2',
  roseInk:    '#A03A0A',

  /** The oversized page number set behind each heading. */
  ghost:      '#EFEDE3',
  line:       '#E6E3D8',
  lineSoft:   '#F2F0E8',
  altRow:     '#FAF8F1',
}

export const PAGE = { width: 595.28, height: 841.89, gutter: 52 }

export type { Portrait } from './guide-assets'

// ─── Glyphs, all drawn ─────────────────────────────────────────────────────────
// The standard PDF fonts are WinAnsi, so a tick, a cross or a warning triangle
// renders as a hollow box. Everything non-Latin in this document is vector.

type GlyphProps = { size?: number; color?: string }

export const Diamond = ({ size = 6, color = G.gold }: GlyphProps) => (
  <Svg width={size} height={size} viewBox="0 0 10 10"><Path d="M5 0 10 5 5 10 0 5Z" fill={color} /></Svg>
)

export const Tick = ({ size = 9, color = G.greenMid }: GlyphProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M20 6 9 17l-5-5" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

export const Ban = ({ size = 9, color = G.rose }: GlyphProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={2.2} fill="none" />
    <Path d="m4.9 4.9 14.2 14.2" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
  </Svg>
)

export const Warning = ({ size = 9, color = G.goldInk }: GlyphProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
      stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
    <Path d="M12 9v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx="12" cy="17" r="0.9" fill={color} />
  </Svg>
)

export const Hand = ({ size = 9, color = G.roseInk }: GlyphProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v7M10 10.5V6a2 2 0 0 0-4 0v9"
      stroke={color} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8v-1a2 2 0 1 1 4 0"
      stroke={color} strokeWidth={1.9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
)

const GLYPHS: Record<string, string[]> = {
  bank:   ['M3 22h18', 'M6 18v-7', 'M10 18v-7', 'M14 18v-7', 'M18 18v-7', 'M12 2 21 7 3 7Z'],
  shield: ['M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z', 'm9 12 2 2 4-4'],
  cycle:  ['M21 12a9 9 0 0 1-9 9 9 9 0 0 1-8-5', 'M3 12a9 9 0 0 1 9-9 9 9 0 0 1 8 5', 'M21 3v5h-5', 'M3 21v-5h5'],
  wallet: ['M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  book:   ['M4 19.5A2.5 2.5 0 0 1 6.5 17H20', 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z'],
  users:  ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.9'],
  lock:   ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  seed:   ['M12 22V10', 'M12 10c0-3 2-6 6-6 0 3-2 6-6 6Z', 'M12 13c0-3-2-5-5-5 0 3 2 5 5 5Z'],
  flag:   ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z', 'M4 22v-7'],
  invite: ['M4 4h16v16H4z', 'm4 7 8 5 8-5'],
  scale:  ['M12 3v18', 'M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2', 'M7 21h10', 'm16 16 3-8 3 8a5 5 0 0 1-6 0Z', 'm2 16 3-8 3 8a5 5 0 0 1-6 0Z'],
  chart:  ['M12 20V10', 'M18 20V4', 'M6 20v-4'],
  clock:  ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 6v6l4 2'],
  gem:    ['M6 3h12l4 6-10 12L2 9Z', 'M11 3 8 9l4 12 4-12-3-6', 'M2 9h20'],
  heart:  ['M19 14c1.5-1.5 3-3.4 3-5.5A5.5 5.5 0 0 0 12 5.4 5.5 5.5 0 0 0 2 8.5c0 2.1 1.5 4 3 5.5l7 7Z'],
  phone:  ['M5 2h14v20H5z', 'M11 18h2'],
  card:   ['M2 5h20v14H2z', 'M2 10h20'],
  file:   ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v5h5', 'M8 13h8', 'M8 17h8'],
  key:    ['M15 2a7 7 0 1 0-6.6 9.3L3 17v4h4l6-6a7 7 0 0 0 2-13Z', 'M16.5 7.5h.01'],
}

export function Glyph({ name, size = 11, color = G.green }: { name: string; size?: number; color?: string }) {
  const paths = GLYPHS[name] ?? GLYPHS.book!
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  )
}

// ─── Backdrops ─────────────────────────────────────────────────────────────────

/**
 * The concentric line-work behind the cover and the dividers.
 *
 * Guilloche, in the sense a share certificate uses it: rings struck from a
 * point off the page so they read as arcs rather than as a target. Faint enough
 * that at reading distance it is a texture and not a picture.
 */
export function Guilloche({
  cx = 690, cy = 300, rings = 28, gap = 25, color = '#2F7452', opacity = 0.5,
}: { cx?: number; cy?: number; rings?: number; gap?: number; color?: string; opacity?: number }) {
  return (
    <Svg width={PAGE.width} height={PAGE.height} viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}
      style={{ position: 'absolute', top: 0, left: 0 }}>
      <SvgG opacity={opacity}>
        {Array.from({ length: rings }, (_, i) => (
          <Circle key={i} cx={cx} cy={cy} r={36 + i * gap} fill="none" stroke={color} strokeWidth={0.45} />
        ))}
      </SvgG>
    </Svg>
  )
}

/** The dark ground, as a gradient rather than a flat fill. */
export function NightGround() {
  return (
    <Svg width={PAGE.width} height={PAGE.height} viewBox={`0 0 ${PAGE.width} ${PAGE.height}`}
      style={{ position: 'absolute', top: 0, left: 0 }}>
      <Defs>
        <LinearGradient id="ng" x1="0%" y1="0%" x2="65%" y2="100%">
          <Stop offset="0%" stopColor={G.nightLift} />
          <Stop offset="42%" stopColor={G.night} />
          <Stop offset="100%" stopColor={G.nightDeep} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={PAGE.width} height={PAGE.height} fill="url(#ng)" />
    </Svg>
  )
}

/** The green-to-gold hairline that closes the running head. */
function GradientRule({ width, height = 1.3 }: { width: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id="gr" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={G.green} />
          <Stop offset="60%" stopColor={G.goldDeep} />
          <Stop offset="100%" stopColor={G.gold} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#gr)" />
    </Svg>
  )
}

// ─── Running head and foot ─────────────────────────────────────────────────────

const chrome = StyleSheet.create({
  head: {
    position: 'absolute', top: 32, left: PAGE.gutter, right: PAGE.gutter,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  org: { fontSize: 10, fontFamily: 'Geist', fontWeight: 600, color: G.green, letterSpacing: 0.85 },
  tagline: { fontFamily: 'Geist', fontSize: 5.4, color: G.goldInk, letterSpacing: 1.5, marginTop: 3.5 },
  right: { alignItems: 'flex-end', maxWidth: 210 },
  eyebrow: { fontFamily: 'Geist', fontSize: 5.4, color: G.goldInk, letterSpacing: 1.6 },
  where: { fontSize: 7.4, fontFamily: 'Geist', fontWeight: 600, color: G.green, letterSpacing: 0.7, marginTop: 3.5, textAlign: 'right' },
  rule: { position: 'absolute', top: 68, left: PAGE.gutter },

  foot: {
    position: 'absolute', bottom: 30, left: PAGE.gutter, right: PAGE.gutter,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: 0.6, borderTopColor: G.line, paddingTop: 9,
  },
  footL: { fontSize: 5.7, fontFamily: 'Geist', fontWeight: 600, color: G.green, letterSpacing: 1.1 },
  footC: { fontFamily: 'Geist', fontSize: 5.5, color: G.ink35, letterSpacing: 1.1 },
  footR: { fontSize: 6.4, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 1 },
})

/**
 * `doc` names the document, not the page. It defaults to the guide because that
 * is what this kit was built for — and it is a prop because the Leadership
 * Handbook shares every other piece of the design and is emphatically not the
 * Founder Guide. A handbook whose every page says "FOUNDER GUIDE" is a handbook
 * somebody will file in the wrong place.
 */
export function RunningHead({ where, doc = 'FOUNDER GUIDE' }: { where: string; doc?: string }) {
  return (
    <>
      <View style={chrome.head} fixed>
        <View style={chrome.brand}>
          <XmmMark size={23} />
          <View>
            <Text style={chrome.org}>XKIMI XA MALI FOUNDATION</Text>
            <Text style={chrome.tagline}>CONTRIBUTING  ·  GROWING  ·  SECURING</Text>
          </View>
        </View>
        <View style={chrome.right}>
          <Text style={chrome.eyebrow}>{doc}</Text>
          <Text style={chrome.where}>{where.toUpperCase()}</Text>
        </View>
      </View>
      <View style={chrome.rule} fixed>
        <GradientRule width={PAGE.width - PAGE.gutter * 2} />
      </View>
    </>
  )
}

/**
 * The page number comes from the renderer, not from the structure.
 *
 * It used to be computed and passed in, which is right only while every section
 * fits on one page. A section that overflowed printed its own number twice and
 * the document quietly went one page longer than it said it was — a footer
 * reading "17 / 34" on the eighteenth sheet. Asking the renderer means the
 * footer is true whatever the layout does; `assertPagination` is what keeps the
 * layout honest as well.
 */
export function RunningFoot({ doc = 'FOUNDER GUIDE' }: { doc?: string } = {}) {
  return (
    <View style={chrome.foot} fixed>
      <Text style={chrome.footL}>XKIMI XA MALI FOUNDATION</Text>
      <Text style={chrome.footC}>PRIVATE &amp; CONFIDENTIAL  ·  {doc}</Text>
      <Text
        style={chrome.footR}
        render={({ pageNumber, totalPages }) => `${String(pageNumber).padStart(2, '0')} / ${totalPages}`}
      />
    </View>
  )
}

/** The oversized page number set into the corner, behind the heading. */
export function GhostNumeral({ n }: { n: number }) {
  return (
    <Text style={{
      position: 'absolute', top: 74, right: PAGE.gutter - 6,
      fontSize: 74, fontFamily: 'Times-Bold', color: G.ghost, letterSpacing: -1.5,
    }}>
      {String(n).padStart(2, '0')}
    </Text>
  )
}

/** The green marker bleeding off the outer edge, level with the heading. */
export function EdgeTab() {
  return <View style={{ position: 'absolute', top: 128, right: 0, width: 7, height: 92, backgroundColor: G.greenMid }} fixed />
}

// ─── Display type ──────────────────────────────────────────────────────────────

const type = StyleSheet.create({
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9 },
  kickerText: { fontSize: 6.6, fontFamily: 'Geist', fontWeight: 600, color: G.goldInk, letterSpacing: 2 },

  h1: { fontSize: 23, fontFamily: 'Times-Bold', color: G.green, lineHeight: 1.2 },
  h1Gold: { fontFamily: 'Times-BoldItalic', color: G.gold },
  headRule: { height: 2, width: 62, backgroundColor: G.gold, marginTop: 11, marginBottom: 14 },

  h2: { fontSize: 12.5, fontFamily: 'Times-Bold', color: G.green, marginTop: 3, marginBottom: 8 },

  lede: { fontFamily: 'Geist', fontSize: 9.8, color: G.ink, lineHeight: 1.6, marginBottom: 11 },
  p: { fontFamily: 'Geist', fontSize: 8.7, color: G.ink70, lineHeight: 1.62, marginBottom: 8 },
  strong: { fontFamily: 'Geist', fontWeight: 600, color: G.ink },
})

export function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <View style={type.kicker}>
      <Diamond size={6} />
      <Text style={type.kickerText}>{children}</Text>
    </View>
  )
}

/**
 * The display voice: a green roman phrase running into a gold italic one, as
 * one line of type rather than two stacked headings.
 */
export function Heading({ plain, italic }: { plain: string; italic?: string }) {
  return (
    <>
      <Text style={type.h1}>
        {plain}
        {italic ? <Text style={type.h1Gold}> {italic}</Text> : null}
      </Text>
      <View style={type.headRule} />
    </>
  )
}

export const H2 = ({ children }: { children: React.ReactNode }) => <Text style={type.h2}>{children}</Text>
export const Lede = ({ children }: { children: React.ReactNode }) => <Text style={type.lede}>{children}</Text>
export const P = ({ children }: { children: React.ReactNode }) => <Text style={type.p}>{children}</Text>
export const B = ({ children }: { children: React.ReactNode }) => <Text style={type.strong}>{children}</Text>

// ─── Panels and boxes ──────────────────────────────────────────────────────────

const box = StyleSheet.create({
  hero: { borderRadius: 5, overflow: 'hidden', marginBottom: 13, backgroundColor: '#0E3625' },
  heroTop: { height: 2.5, backgroundColor: G.gold },
  heroInner: { paddingHorizontal: 20, paddingVertical: 17, flexDirection: 'row', gap: 15, alignItems: 'flex-start' },
  heroMedal: {
    width: 42, height: 42, borderRadius: 21, borderWidth: 1.4, borderColor: G.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  heroTitle: { fontSize: 13.5, fontFamily: 'Times-Bold', color: G.goldLight, marginBottom: 6 },
  heroText: { fontFamily: 'Geist', fontSize: 8.3, color: '#CFE0D7', lineHeight: 1.62 },
  heroStrong: { fontFamily: 'Geist', fontWeight: 600, color: '#FFFFFF' },

  advice: { borderRadius: 4, borderLeftWidth: 3, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 11 },
  adviceHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  adviceLabel: { fontSize: 6.3, fontFamily: 'Geist', fontWeight: 600, letterSpacing: 1.7 },
  adviceText: { fontFamily: 'Geist', fontSize: 8.3, lineHeight: 1.6 },
})

/** Emphasis inside a dark panel, where the body colour is already light. */
export const HB = ({ children }: { children: React.ReactNode }) => <Text style={box.heroStrong}>{children}</Text>

/**
 * The dark panel the first edition reserves for the statements a member must
 * not skim — that no money is ever held inside the platform, and that
 * contributions cannot be taken back out. Used sparingly for that reason.
 */
export function HeroPanel({
  title, children, glyph, centred = false,
}: { title: string; children: React.ReactNode; glyph?: string; centred?: boolean }) {
  return (
    <View style={box.hero} wrap={false}>
      <View style={box.heroTop} />
      {centred ? (
        <View style={{ paddingHorizontal: 26, paddingVertical: 18, alignItems: 'center' }}>
          {glyph && <View style={{ marginBottom: 9 }}><Glyph name={glyph} size={20} color={G.gold} /></View>}
          <Text style={[box.heroTitle, { textAlign: 'center', fontFamily: 'Geist', fontSize: 14.5 }]}>{title}</Text>
          <Text style={[box.heroText, { textAlign: 'center' }]}>{children}</Text>
        </View>
      ) : (
        <View style={box.heroInner}>
          {glyph && <View style={box.heroMedal}><Glyph name={glyph} size={18} color={G.gold} /></View>}
          <View style={{ flex: 1 }}>
            <Text style={box.heroTitle}>{title}</Text>
            <Text style={box.heroText}>{children}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

type AdviceTone = 'gold' | 'green' | 'rose'
const TONE: Record<AdviceTone, { bg: string; line: string; ink: string; label: string }> = {
  gold:  { bg: G.goldPale,  line: G.goldLine, ink: '#6E5514', label: G.goldInk },
  green: { bg: G.greenPale, line: G.greenMid, ink: '#245243', label: '#1E5C48' },
  rose:  { bg: G.rosePale,  line: G.rose,     ink: '#84300B', label: G.roseInk },
}

export function Advice({
  tone = 'gold', label, children,
}: { tone?: AdviceTone; label: string; children: React.ReactNode }) {
  const t = TONE[tone]
  const Icon = tone === 'green' ? Tick : tone === 'rose' ? Hand : Warning
  return (
    <View style={[box.advice, { backgroundColor: t.bg, borderLeftColor: t.line }]} wrap={false}>
      <View style={box.adviceHead}>
        <Icon size={9} color={t.label} />
        <Text style={[box.adviceLabel, { color: t.label }]}>{label.toUpperCase()}</Text>
      </View>
      <Text style={[box.adviceText, { color: t.ink }]}>{children}</Text>
    </View>
  )
}

// ─── Stat tiles ────────────────────────────────────────────────────────────────

const tile = StyleSheet.create({
  row: { flexDirection: 'row', borderWidth: 0.7, borderColor: G.line, borderRadius: 4, marginBottom: 13, overflow: 'hidden', backgroundColor: G.paper },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 13, paddingHorizontal: 5, borderLeftWidth: 0.7, borderLeftColor: G.line },
  value: { fontSize: 20, fontFamily: 'Times-Bold', color: G.green },
  prefix: { fontSize: 11.5, fontFamily: 'Times-Bold', color: G.gold },
  label: { fontFamily: 'Geist', fontSize: 5.7, color: G.ink50, letterSpacing: 1.15, marginTop: 5, textAlign: 'center' },
})

export function Stats({ items }: { items: { value: string; prefix?: string; label: string }[] }) {
  return (
    <View style={tile.row} wrap={false}>
      {items.map((s, i) => (
        <View key={i} style={[tile.cell, i === 0 ? { borderLeftWidth: 0 } : {}]}>
          <Text style={tile.value}>
            {s.prefix ? <Text style={tile.prefix}>{s.prefix}</Text> : null}{s.value}
          </Text>
          <Text style={tile.label}>{s.label.toUpperCase()}</Text>
        </View>
      ))}
    </View>
  )
}

// ─── Icon list ─────────────────────────────────────────────────────────────────

const il = StyleSheet.create({
  row: { flexDirection: 'row', gap: 11, marginBottom: 10 },
  chip: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 0.8, borderColor: G.line,
    backgroundColor: G.paper, alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 8.9, fontFamily: 'Geist', fontWeight: 600, color: G.ink, marginBottom: 3 },
  text: { fontFamily: 'Geist', fontSize: 8.2, color: G.ink70, lineHeight: 1.55 },
})

export function IconList({ items }: { items: { glyph: string; title: string; text: React.ReactNode }[] }) {
  return (
    <View>
      {items.map((it, i) => (
        <View key={i} style={il.row} wrap={false}>
          <View style={il.chip}><Glyph name={it.glyph} size={12} color={G.greenMid} /></View>
          <View style={{ flex: 1 }}>
            <Text style={il.title}>{it.title}</Text>
            <Text style={il.text}>{it.text}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

// ─── The journey rail ──────────────────────────────────────────────────────────

const rail = StyleSheet.create({
  frame: { borderWidth: 0.7, borderColor: G.line, borderRadius: 5, backgroundColor: G.paper, paddingHorizontal: 14, paddingVertical: 16, marginBottom: 12 },
  track: { flexDirection: 'row', position: 'relative' },
  line: { position: 'absolute', top: 17, left: 48, right: 48, height: 1, backgroundColor: G.goldLine },
  stop: { flex: 1, alignItems: 'center' },
  disc: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: G.green,
    borderWidth: 1.6, borderColor: G.gold, alignItems: 'center', justifyContent: 'center',
  },
  n: { fontSize: 5.7, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 1, marginTop: 8 },
  t: { fontSize: 8.1, fontFamily: 'Geist', fontWeight: 600, color: G.ink, textAlign: 'center', marginTop: 4 },
  d: { fontFamily: 'Geist', fontSize: 6.9, color: G.ink50, textAlign: 'center', lineHeight: 1.45, marginTop: 3, paddingHorizontal: 4 },
})

export function JourneyRail({ stops }: { stops: { glyph: string; title: string; text: string }[] }) {
  return (
    <View style={rail.frame} wrap={false}>
      <View style={rail.track}>
        <View style={rail.line} />
        {stops.map((s, i) => (
          <View key={i} style={rail.stop}>
            <View style={rail.disc}><Glyph name={s.glyph} size={15} color={G.gold} /></View>
            <Text style={rail.n}>{String(i + 1).padStart(2, '0')}</Text>
            <Text style={rail.t}>{s.title}</Text>
            <Text style={rail.d}>{s.text}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Tables ────────────────────────────────────────────────────────────────────

const tb = StyleSheet.create({
  frame: { borderWidth: 0.7, borderColor: G.line, borderRadius: 4, overflow: 'hidden', marginBottom: 12, backgroundColor: G.paper },
  head: { flexDirection: 'row', backgroundColor: G.green, paddingVertical: 7, paddingHorizontal: 12 },
  headCell: { fontSize: 5.8, fontFamily: 'Geist', fontWeight: 600, color: G.paper, letterSpacing: 1.4 },
  row: { flexDirection: 'row', paddingVertical: 7.5, paddingHorizontal: 12, borderTopWidth: 0.6, borderTopColor: G.lineSoft },
  alt: { backgroundColor: G.altRow },
  cell: { fontFamily: 'Geist', fontSize: 8, color: G.ink70, lineHeight: 1.5 },
  first: { fontSize: 8, fontFamily: 'Geist', fontWeight: 600, color: G.ink, lineHeight: 1.5 },
})

export function Table({
  head, rows, widths,
}: { head: string[]; rows: React.ReactNode[][]; widths: number[] }) {
  return (
    <View style={tb.frame}>
      <View style={tb.head} wrap={false}>
        {head.map((h, i) => (
          <Text key={i} style={[tb.headCell, { width: `${widths[i]! * 100}%` }]}>{h.toUpperCase()}</Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={[tb.row, i % 2 === 1 ? tb.alt : {}]} wrap={false}>
          {r.map((c, j) => (
            <Text key={j} style={[j === 0 ? tb.first : tb.cell, { width: `${widths[j]! * 100}%`, paddingRight: 9 }]}>
              {c}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

// ─── Two columns: what is so, and what is not ──────────────────────────────────

const cmp = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  col: { flex: 1, borderWidth: 0.7, borderRadius: 4, paddingHorizontal: 13, paddingVertical: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  title: { fontSize: 6.3, fontFamily: 'Geist', fontWeight: 600, letterSpacing: 1.4 },
  item: { fontFamily: 'Geist', fontSize: 7.7, lineHeight: 1.5, marginBottom: 5 },
})

export function Compare({
  yes, no,
}: { yes: { title: string; items: string[] }; no: { title: string; items: string[] } }) {
  return (
    <View style={cmp.row} wrap={false}>
      <View style={[cmp.col, { backgroundColor: G.paper, borderColor: G.greenLine }]}>
        <View style={cmp.head}><Tick size={9} /><Text style={[cmp.title, { color: '#1E5C48' }]}>{yes.title.toUpperCase()}</Text></View>
        {yes.items.map((s, i) => <Text key={i} style={[cmp.item, { color: G.ink70 }]}>{s}</Text>)}
      </View>
      <View style={[cmp.col, { backgroundColor: G.rosePale, borderColor: G.roseLine }]}>
        <View style={cmp.head}><Ban size={9} /><Text style={[cmp.title, { color: G.roseInk }]}>{no.title.toUpperCase()}</Text></View>
        {no.items.map((s, i) => <Text key={i} style={[cmp.item, { color: '#84300B' }]}>{s}</Text>)}
      </View>
    </View>
  )
}

// ─── Pull quote and rules ──────────────────────────────────────────────────────

const pq = StyleSheet.create({
  wrap: { borderLeftWidth: 2.5, borderLeftColor: G.gold, paddingLeft: 14, paddingVertical: 3, marginTop: 3, marginBottom: 12 },
  text: { fontSize: 10.2, fontFamily: 'Times-Italic', color: G.green, lineHeight: 1.52 },
  attr: { fontSize: 5.9, fontFamily: 'Geist', fontWeight: 600, color: G.goldInk, letterSpacing: 1.6, marginTop: 7 },
})

export function Quote({ children, attr }: { children: React.ReactNode; attr?: string }) {
  return (
    <View style={pq.wrap} wrap={false}>
      <Text style={pq.text}>{children}</Text>
      {attr && <Text style={pq.attr}>{attr.toUpperCase()}</Text>}
    </View>
  )
}

/** A gold diamond between two rules, closing a page of prose. */
export function DiamondRule() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 16, justifyContent: 'center' }}>
      <View style={{ height: 0.7, width: 118, backgroundColor: G.line }} />
      <Diamond size={7} />
      <View style={{ height: 0.7, width: 118, backgroundColor: G.line }} />
    </View>
  )
}

// ─── The founders ──────────────────────────────────────────────────────────────

const fc = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  card: { flex: 1, borderWidth: 0.7, borderColor: G.line, borderRadius: 5, overflow: 'hidden', backgroundColor: G.paper },
  // The portraits are finished cards: the role and the name are part of the
  // artwork. `contain` because cropping to fill would cut the name band off,
  // and nothing is captioned again underneath.
  // `contain`, never `cover`. The portraits are finished cards whose gold name
  // band sits at the foot; cropping to fill a frame either cuts the band off or,
  // anchored to the bottom, cuts their faces off instead. A fixed height with
  // `contain` keeps every card whole and keeps the four the same size.
  photo: { width: '100%', height: 168, objectFit: 'contain' },
  photoFrame: { backgroundColor: '#0C0C0C' },
  body: { paddingHorizontal: 11, paddingVertical: 9, borderTopWidth: 0.7, borderTopColor: G.lineSoft },
  role: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  roleText: { fontSize: 5.7, fontFamily: 'Geist', fontWeight: 600, color: G.goldInk, letterSpacing: 1.2 },
  bio: { fontFamily: 'Geist', fontSize: 7.2, color: G.ink70, lineHeight: 1.45 },

  strip: { flexDirection: 'row', gap: 9 },
  stripCard: { flex: 1, height: 152, borderWidth: 0.8, borderColor: 'rgba(212,175,55,0.4)', borderRadius: 3, overflow: 'hidden' },
  stripPhoto: { width: '100%', height: '100%', objectFit: 'cover', objectPositionY: '100%' },
})

export function FounderGrid({
  founders,
}: { founders: { photo: Portrait; glyph: string; role: string; bio: string }[] }) {
  // Laid out as explicit rows of two rather than one wrapping row. With
  // `flexWrap` the renderer produced the first row and silently dropped the
  // second — two of the four founders simply were not on the page, and nothing
  // reported it.
  const rows: typeof founders[] = []
  for (let i = 0; i < founders.length; i += 2) rows.push(founders.slice(i, i + 2))

  return (
    <View>
      {rows.map((row, r) => (
        <View key={r} style={fc.row}>
          {row.map((f, i) => (
            <View key={i} style={fc.card} wrap={false}>
              {/* The portrait already carries the role and the name in a gold
                  band at its foot, so neither is repeated underneath it. */}
              <View style={fc.photoFrame}><Image src={f.photo} style={fc.photo} /></View>
              <View style={fc.body}>
                <View style={fc.role}>
                  <Glyph name={f.glyph} size={9} color={G.goldInk} />
                  <Text style={fc.roleText}>{f.role.toUpperCase()}</Text>
                </View>
                <Text style={fc.bio}>{f.bio}</Text>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

/** The four of them across the foot of the cover. */
export function FounderStrip({ photos }: { photos: Portrait[] }) {
  return (
    <View style={fc.strip}>
      {photos.map((p, i) => (
        <View key={i} style={fc.stripCard}><Image src={p} style={fc.stripPhoto} /></View>
      ))}
    </View>
  )
}

// ─── Cover ─────────────────────────────────────────────────────────────────────

const cv = StyleSheet.create({
  page: { flex: 1, height: '100%', position: 'relative' },
  inner: { flex: 1, paddingHorizontal: 52, paddingTop: 44, paddingBottom: 38 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  conf: { alignItems: 'flex-end' },
  confA: { fontSize: 6.3, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 2 },
  confB: { fontFamily: 'Geist', fontSize: 5.5, color: G.greenSoft, letterSpacing: 1.6, marginTop: 4 },

  eyebrow: { fontSize: 6.6, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 3, marginBottom: 13 },
  title: { fontSize: 42, fontFamily: 'Times-Bold', color: '#FFFFFF', lineHeight: 1.1 },
  titleGold: { fontFamily: 'Times-BoldItalic', color: G.gold },
  rule: { height: 1.6, width: 128, backgroundColor: G.gold, marginTop: 19, marginBottom: 17 },
  blurb: { fontFamily: 'Geist', fontSize: 8.5, color: '#C6D9CF', lineHeight: 1.78, maxWidth: 392 },

  scripture: {
    borderWidth: 0.8, borderColor: 'rgba(212,175,55,0.45)', borderRadius: 3,
    paddingHorizontal: 16, paddingVertical: 13, marginTop: 21, maxWidth: 404,
  },
  scriptureText: { fontSize: 9.4, fontFamily: 'Times-Italic', color: '#FFFFFF' },
  scriptureRef: { fontSize: 5.9, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 1.8, marginTop: 7 },

  plinth: {
    borderTopWidth: 0.7, borderTopColor: 'rgba(212,175,55,0.35)', paddingTop: 13,
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 19,
  },
  pLabel: { fontFamily: 'Geist', fontSize: 5.5, color: G.greenSoft, letterSpacing: 1.6, marginBottom: 5 },
  pValue: { fontSize: 9, fontFamily: 'Times-Bold', color: '#FFFFFF', letterSpacing: 0.4 },
})

export function Cover({
  version, released, nextReview, blurb, photos,
}: {
  version: string
  released: string
  nextReview: string
  blurb: string
  photos: Portrait[]
}) {
  return (
    <View style={cv.page}>
      <NightGround />
      <Guilloche />
      <View style={cv.inner}>
        <View style={cv.topRow}>
          <XmmMark size={60} />
          <View style={cv.conf}>
            <Text style={cv.confA}>PRIVATE &amp; CONFIDENTIAL</Text>
            <Text style={cv.confB}>FOUNDING MEMBERS ONLY</Text>
          </View>
        </View>

        <View style={{ marginTop: 62 }}>
          <Text style={cv.eyebrow}>XKIMI XA MALI FOUNDATION</Text>
          <Text style={cv.title}>The Founder{'\n'}<Text style={cv.titleGold}>Guide</Text></Text>
          <View style={cv.rule} />
          <Text style={cv.blurb}>{blurb}</Text>

          <View style={cv.scripture}>
            <Text style={cv.scriptureText}>“It is more blessed to give than to receive.”</Text>
            <Text style={cv.scriptureRef}>ACTS 20:35</Text>
          </View>
        </View>

        <View style={{ flex: 1 }} />
        <FounderStrip photos={photos} />

        <View style={cv.plinth}>
          <View>
            <Text style={cv.pLabel}>VERSION</Text>
            <Text style={cv.pValue}>{version}</Text>
          </View>
          <View>
            <Text style={cv.pLabel}>RELEASED</Text>
            <Text style={cv.pValue}>{released}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={cv.pLabel}>NEXT REVIEW</Text>
            <Text style={cv.pValue}>{nextReview}</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

// ─── Part divider ──────────────────────────────────────────────────────────────

const dv = StyleSheet.create({
  page: { flex: 1, height: '100%', position: 'relative' },
  inner: { flex: 1, paddingHorizontal: 62, paddingTop: 92 },
  numeral: { fontSize: 92, fontFamily: 'Times-Bold', color: 'rgba(255,255,255,0.10)', lineHeight: 1 },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 20, marginBottom: 11 },
  kickerText: { fontSize: 6.8, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 2.4 },
  title: { fontSize: 30, fontFamily: 'Times-Bold', color: '#FFFFFF', lineHeight: 1.18 },
  titleGold: { fontFamily: 'Times-BoldItalic', color: G.gold },
  rule: { height: 1.6, width: 94, backgroundColor: G.gold, marginTop: 17, marginBottom: 19 },
  conviction: { fontSize: 10.8, fontFamily: 'Times-Italic', color: '#D8E6DF', lineHeight: 1.62, maxWidth: 396 },
  convictionGold: { fontFamily: 'Times-BoldItalic', color: G.goldLight },
  label: { fontSize: 5.7, fontFamily: 'Geist', fontWeight: 600, color: G.greenSoft, letterSpacing: 2, marginTop: 15 },
  foot: {
    position: 'absolute', left: 62, right: 62, bottom: 50,
    borderTopWidth: 0.7, borderTopColor: 'rgba(212,175,55,0.3)', paddingTop: 12,
    flexDirection: 'row', flexWrap: 'wrap', gap: 15,
  },
  footItem: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  footN: { fontSize: 6.3, fontFamily: 'Geist', fontWeight: 600, color: G.gold, letterSpacing: 0.8 },
  footT: { fontFamily: 'Geist', fontSize: 7.5, color: 'rgba(255,255,255,0.72)' },
})

export function PartDivider({
  numeral, roman, plain, italic, conviction, convictionTail, label, sections,
}: {
  numeral: string
  roman: string
  plain: string
  italic: string
  conviction: string
  convictionTail?: string
  label: string
  sections: { num: number; title: string }[]
}) {
  return (
    <View style={dv.page}>
      <NightGround />
      <Guilloche cx={-70} cy={660} rings={22} gap={30} opacity={0.4} />
      <View style={dv.inner}>
        <Text style={dv.numeral}>{numeral}</Text>
        <View style={dv.kicker}>
          <Diamond size={7} />
          <Text style={dv.kickerText}>PART {roman.toUpperCase()}</Text>
        </View>
        <Text style={dv.title}>{plain}{'\n'}<Text style={dv.titleGold}>{italic}</Text></Text>
        <View style={dv.rule} />
        <Text style={dv.conviction}>
          {conviction}
          {convictionTail ? <Text style={dv.convictionGold}>{convictionTail}</Text> : null}
        </Text>
        <Text style={dv.label}>{label.toUpperCase()}</Text>
      </View>
      <View style={dv.foot}>
        {sections.map((s) => (
          <View key={s.num} style={dv.footItem}>
            <Text style={dv.footN}>{String(s.num).padStart(2, '0')}</Text>
            <Text style={dv.footT}>{s.title}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Contents ──────────────────────────────────────────────────────────────────

const tc = StyleSheet.create({
  part: { flexDirection: 'row', alignItems: 'baseline', marginTop: 11, marginBottom: 6 },
  partRoman: { fontSize: 6.1, fontFamily: 'Geist', fontWeight: 600, color: G.goldInk, letterSpacing: 1.6 },
  partLine: { flex: 1, height: 0.6, backgroundColor: G.line, marginHorizontal: 10 },
  partName: { fontSize: 9, fontFamily: 'Times-Bold', color: G.green },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  num: { fontSize: 6.7, fontFamily: 'Geist', fontWeight: 600, color: G.gold, width: 19, letterSpacing: 0.6 },
  name: { fontFamily: 'Geist', fontSize: 8.3, color: G.ink70 },
  leader: { flex: 1, borderBottomWidth: 0.6, borderBottomColor: G.line, borderBottomStyle: 'dotted', marginHorizontal: 6, marginBottom: 2.3 },
  page: { fontSize: 6.9, fontFamily: 'Geist', fontWeight: 600, color: G.ink50, letterSpacing: 0.6 },
})

export function Contents({
  parts,
}: {
  parts: { roman: string; title: string; sections: { num: number; title: string; page: number }[] }[]
}) {
  return (
    <View>
      {parts.map((part) => (
        <View key={part.roman} wrap={false}>
          <View style={tc.part}>
            <Text style={tc.partRoman}>PART {part.roman.toUpperCase()}</Text>
            <View style={tc.partLine} />
            <Text style={tc.partName}>{part.title}</Text>
          </View>
          {part.sections.map((s) => (
            <View key={s.num} style={tc.row}>
              <Text style={tc.num}>{String(s.num).padStart(2, '0')}</Text>
              <Text style={tc.name}>{s.title}</Text>
              <View style={tc.leader} />
              <Text style={tc.page}>{String(s.page).padStart(2, '0')}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

// ─── Signature block ───────────────────────────────────────────────────────────

const sg = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, marginTop: 4 },
  card: {
    width: '47.6%', borderWidth: 0.7, borderColor: G.line, borderRadius: 4,
    backgroundColor: G.paper, paddingHorizontal: 14, paddingVertical: 13,
  },
  name: { fontSize: 10, fontFamily: 'Times-Bold', color: G.green },
  role: { fontSize: 5.7, fontFamily: 'Geist', fontWeight: 600, color: G.goldInk, letterSpacing: 1.3, marginTop: 3 },
  line: { borderBottomWidth: 0.8, borderBottomColor: G.ink35, marginTop: 28 },
  cap: { fontFamily: 'Geist', fontSize: 5.5, color: G.ink35, letterSpacing: 1.2, marginTop: 5 },
  dateLine: { borderBottomWidth: 0.8, borderBottomColor: G.ink35, marginTop: 18, width: '60%' },
})

export function SignatureGrid({ people }: { people: { name: string; role: string }[] }) {
  return (
    <View style={sg.grid}>
      {people.map((p, i) => (
        <View key={i} style={sg.card} wrap={false}>
          <Text style={sg.name}>{p.name}</Text>
          <Text style={sg.role}>{p.role.toUpperCase()}</Text>
          <View style={sg.line} />
          <Text style={sg.cap}>SIGNATURE</Text>
          <View style={sg.dateLine} />
          <Text style={sg.cap}>DATE</Text>
        </View>
      ))}
    </View>
  )
}
