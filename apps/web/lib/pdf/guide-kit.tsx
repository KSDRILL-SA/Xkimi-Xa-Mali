import React from 'react'
import { View, Text, Svg, Path, Circle, Rect, StyleSheet } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { C, XmmMark } from './kit'

/**
 * The Founder Guide's own furniture.
 *
 * The statement and the contribution report share `kit.tsx` because they are the
 * same kind of artefact: one page of figures, a masthead, a footer. The guide is
 * not that. It is a long-form document that a member reads once and returns to,
 * so it needs a running head rather than a masthead, a contents page, part
 * dividers, and a set of blocks — rules, notes, warnings, steps — that a
 * statement has no use for.
 *
 * The palette, the mark and the money formatting still come from `kit`, so the
 * guide and the statement remain visibly the same organisation. Everything that
 * is only the guide's lives here.
 */

// ─── Guide-specific tones ──────────────────────────────────────────────────────

export const G = {
  /** The dark ground of the cover and the part dividers. */
  night: '#082016',
  /** A step lighter, for the band beneath a divider numeral. */
  nightSoft: '#0F3125',
  /** Paper for long reading — warmer than the statement's white cards. */
  page: '#FCFBF7',
  /** The rule block's ground. Deliberately not the note's. */
  ruleBg: '#F2F7F4',
  quoteBg: '#FAF6EC',
}

// ─── Page geometry ─────────────────────────────────────────────────────────────

/** A4, and the margins the whole document is set to. */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  /** Left and right margin of body text. Wide, because the measure matters. */
  gutter: 56,
  headHeight: 34,
  footHeight: 40,
}

// ─── Marks and glyphs ──────────────────────────────────────────────────────────

/**
 * Drawn rather than typed.
 *
 * The standard PDF fonts are WinAnsi-encoded, so a tick, a cross or an arrow
 * renders as a hollow box. Every non-Latin glyph in this document is vector.
 */
export function Tick({ size = 9, color = C.ok }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 6 9 17l-5-5" stroke={color} strokeWidth={3} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function Cross({ size = 9, color = C.red }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 6 6 18M6 6l12 12" stroke={color} strokeWidth={3} fill="none"
        strokeLinecap="round" />
    </Svg>
  )
}

export function Arrow({ size = 9, color = C.gold }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12h13M13 6l6 6-6 6" stroke={color} strokeWidth={2.4} fill="none"
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

/** The small gold lozenge that opens a sub-heading. */
export function Lozenge({ size = 5, color = C.gold }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10">
      <Path d="M5 0 10 5 5 10 0 5Z" fill={color} />
    </Svg>
  )
}

// ─── Running head and footer ───────────────────────────────────────────────────

const chrome = StyleSheet.create({
  head: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: PAGE.headHeight,
    paddingHorizontal: PAGE.gutter,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.6, borderBottomColor: C.mistLine,
    backgroundColor: G.page,
  },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headOrg: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: C.green, letterSpacing: 1.4 },
  headPart: { fontSize: 6.5, color: C.ink35, letterSpacing: 1.1, textTransform: 'uppercase' },

  foot: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: PAGE.footHeight,
    paddingHorizontal: PAGE.gutter, paddingTop: 10,
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    borderTopWidth: 0.6, borderTopColor: C.mistLine,
    backgroundColor: G.page,
  },
  footText: { fontSize: 6, color: C.ink35, letterSpacing: 0.6 },
  footNum: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.green, letterSpacing: 0.6 },
})

export function RunningHead({ part }: { part: string }) {
  return (
    <View style={chrome.head} fixed>
      <View style={chrome.headLeft}>
        <XmmMark size={13} />
        <Text style={chrome.headOrg}>XKIMM XA MALI FOUNDATION</Text>
      </View>
      <Text style={chrome.headPart}>{part}</Text>
    </View>
  )
}

export function RunningFoot({ edition }: { edition: string }) {
  return (
    <View style={chrome.foot} fixed>
      <Text style={chrome.footText}>THE FOUNDER GUIDE</Text>
      <Text
        style={chrome.footNum}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
      <Text style={chrome.footText}>{edition.toUpperCase()}</Text>
    </View>
  )
}

// ─── Typography ────────────────────────────────────────────────────────────────

const t = StyleSheet.create({
  lede: { fontSize: 10.5, color: C.ink, lineHeight: 1.55, marginBottom: 10, fontFamily: 'Times-Roman' },
  p: { fontSize: 9.2, color: C.ink70, lineHeight: 1.62, marginBottom: 8 },
  h3wrap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, marginBottom: 6 },
  h3: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.green, letterSpacing: 1.3, textTransform: 'uppercase' },
  strongInline: { fontFamily: 'Helvetica-Bold', color: C.ink },
})

export function P({ children, style }: { children: React.ReactNode; style?: Style }) {
  return <Text style={style ? [t.p, style] : t.p}>{children}</Text>
}

export function Lede({ children }: { children: React.ReactNode }) {
  return <Text style={t.lede}>{children}</Text>
}

/** Bold run inside a paragraph. */
export function B({ children }: { children: React.ReactNode }) {
  return <Text style={t.strongInline}>{children}</Text>
}

export function H3({ children }: { children: React.ReactNode }) {
  return (
    <View style={t.h3wrap} minPresenceAhead={40}>
      <Lozenge />
      <Text style={t.h3}>{children}</Text>
    </View>
  )
}

// ─── Blocks ────────────────────────────────────────────────────────────────────

const b = StyleSheet.create({
  // A rule the Foundation is bound by. Green bar, because it is not advice.
  rule: {
    flexDirection: 'row', backgroundColor: G.ruleBg, borderRadius: 4,
    marginTop: 4, marginBottom: 10, overflow: 'hidden',
  },
  ruleBar: { width: 3, backgroundColor: C.greenMid },
  ruleBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  ruleLabel: { fontSize: 6.2, fontFamily: 'Helvetica-Bold', color: C.greenMid, letterSpacing: 1.6, marginBottom: 4 },
  ruleText: { fontSize: 9, color: C.green, lineHeight: 1.55, fontFamily: 'Helvetica-Bold' },

  // Context, not obligation.
  note: {
    flexDirection: 'row', backgroundColor: C.skySoft, borderRadius: 4,
    marginTop: 4, marginBottom: 10, overflow: 'hidden',
  },
  noteBar: { width: 3, backgroundColor: C.sky },
  warn: {
    flexDirection: 'row', backgroundColor: C.amberSoft, borderRadius: 4,
    marginTop: 4, marginBottom: 10, overflow: 'hidden',
  },
  warnBar: { width: 3, backgroundColor: C.amber },
  softBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 9 },
  softLabel: { fontSize: 6.2, fontFamily: 'Helvetica-Bold', letterSpacing: 1.6, marginBottom: 4 },
  softText: { fontSize: 8.7, lineHeight: 1.55 },

  bullets: { marginBottom: 8, marginTop: 2 },
  bulletRow: { flexDirection: 'row', marginBottom: 5, paddingRight: 6 },
  bulletMark: { width: 12, paddingTop: 3.2, alignItems: 'flex-start' },
  bulletText: { flex: 1, fontSize: 9.2, color: C.ink70, lineHeight: 1.55 },

  steps: { marginTop: 4, marginBottom: 10 },
  stepRow: { flexDirection: 'row', marginBottom: 9 },
  stepDisc: {
    width: 16, height: 16, borderRadius: 8, backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  stepNum: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.paper },
  stepBody: { flex: 1, paddingTop: 1 },
  stepTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 2.5 },
  stepText: { fontSize: 8.7, color: C.ink70, lineHeight: 1.5 },
  stepRail: {
    position: 'absolute', left: 7.5, top: 16, bottom: 0, width: 0.8,
    backgroundColor: C.mistLine,
  },

  facts: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 12 },
  fact: {
    flex: 1, backgroundColor: C.paper, borderWidth: 0.6, borderColor: C.mistLine,
    borderRadius: 4, paddingHorizontal: 10, paddingVertical: 10,
  },
  factValue: { fontSize: 15, fontFamily: 'Times-Bold', color: C.green, marginBottom: 3 },
  factLabel: { fontSize: 6.2, color: C.ink50, letterSpacing: 0.9, textTransform: 'uppercase', lineHeight: 1.35 },

  table: { borderWidth: 0.6, borderColor: C.mistLine, borderRadius: 4, marginTop: 4, marginBottom: 12, overflow: 'hidden' },
  tHead: { flexDirection: 'row', backgroundColor: C.green, paddingVertical: 6, paddingHorizontal: 10 },
  tHeadCell: { fontSize: 6.4, fontFamily: 'Helvetica-Bold', color: C.paper, letterSpacing: 1.2, textTransform: 'uppercase' },
  tRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 10, borderTopWidth: 0.6, borderTopColor: C.lineSoft },
  tRowAlt: { backgroundColor: C.mist },
  tTerm: { fontSize: 8.4, fontFamily: 'Helvetica-Bold', color: C.ink },
  tDef: { fontSize: 8.4, color: C.ink70, lineHeight: 1.5 },

  quote: {
    backgroundColor: G.quoteBg, borderLeftWidth: 2, borderLeftColor: C.gold,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 6, marginBottom: 12, borderRadius: 3,
  },
  quoteText: { fontSize: 10.5, fontFamily: 'Times-Italic', color: C.green, lineHeight: 1.5 },
  quoteAttr: { fontSize: 6.5, color: C.gold, letterSpacing: 1.3, marginTop: 7, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold' },

  compare: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 12 },
  compareCol: { flex: 1, borderRadius: 4, padding: 11, borderWidth: 0.6 },
  compareHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 7 },
  compareTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1.1, textTransform: 'uppercase' },
  compareItem: { fontSize: 8.3, lineHeight: 1.5, marginBottom: 4 },
})

export function Rule({ label = 'THE RULE', children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={b.rule} wrap={false}>
      <View style={b.ruleBar} />
      <View style={b.ruleBody}>
        <Text style={b.ruleLabel}>{label}</Text>
        <Text style={b.ruleText}>{children}</Text>
      </View>
    </View>
  )
}

export function Note({ label = 'WORTH KNOWING', children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={b.note} wrap={false}>
      <View style={b.noteBar} />
      <View style={b.softBody}>
        <Text style={[b.softLabel, { color: C.sky }]}>{label}</Text>
        <Text style={[b.softText, { color: C.ink70 }]}>{children}</Text>
      </View>
    </View>
  )
}

export function Warn({ label = 'TAKE CARE', children }: { label?: string; children: React.ReactNode }) {
  return (
    <View style={b.warn} wrap={false}>
      <View style={b.warnBar} />
      <View style={b.softBody}>
        <Text style={[b.softLabel, { color: C.amber }]}>{label}</Text>
        <Text style={[b.softText, { color: '#7C4A0B' }]}>{children}</Text>
      </View>
    </View>
  )
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <View style={b.bullets}>
      {items.map((item, i) => (
        <View key={i} style={b.bulletRow}>
          <View style={b.bulletMark}><Lozenge size={4} /></View>
          <Text style={b.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

export function Steps({ items }: { items: { title: string; text: React.ReactNode }[] }) {
  return (
    <View style={b.steps}>
      {items.map((item, i) => (
        <View key={i} style={b.stepRow} wrap={false}>
          {/* The rail joins one step to the next, so the sequence reads as one
              movement rather than four unrelated boxes. Not drawn after the
              last, which would trail into nothing. */}
          {i < items.length - 1 && <View style={b.stepRail} />}
          <View style={b.stepDisc}><Text style={b.stepNum}>{i + 1}</Text></View>
          <View style={b.stepBody}>
            <Text style={b.stepTitle}>{item.title}</Text>
            <Text style={b.stepText}>{item.text}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export function Facts({ items }: { items: { value: string; label: string }[] }) {
  return (
    <View style={b.facts} wrap={false}>
      {items.map((f, i) => (
        <View key={i} style={b.fact}>
          <Text style={b.factValue}>{f.value}</Text>
          <Text style={b.factLabel}>{f.label}</Text>
        </View>
      ))}
    </View>
  )
}

export function Defs({
  head, rows, termWidth = 0.32,
}: {
  head: [string, string]
  rows: [string, string][]
  termWidth?: number
}) {
  return (
    <View style={b.table}>
      <View style={b.tHead} wrap={false}>
        <Text style={[b.tHeadCell, { width: `${termWidth * 100}%` }]}>{head[0]}</Text>
        <Text style={[b.tHeadCell, { flex: 1 }]}>{head[1]}</Text>
      </View>
      {rows.map(([term, def], i) => (
        <View key={i} style={[b.tRow, i % 2 === 1 ? b.tRowAlt : {}]} wrap={false}>
          <Text style={[b.tTerm, { width: `${termWidth * 100}%`, paddingRight: 8 }]}>{term}</Text>
          <Text style={[b.tDef, { flex: 1 }]}>{def}</Text>
        </View>
      ))}
    </View>
  )
}

export function Quote({ children, attr }: { children: React.ReactNode; attr?: string }) {
  return (
    <View style={b.quote} wrap={false}>
      <Text style={b.quoteText}>{children}</Text>
      {attr && <Text style={b.quoteAttr}>{attr}</Text>}
    </View>
  )
}

/** Two columns: what is so, and what is not. */
export function Compare({
  yes, no,
}: {
  yes: { title: string; items: string[] }
  no: { title: string; items: string[] }
}) {
  return (
    <View style={b.compare} wrap={false}>
      <View style={[b.compareCol, { backgroundColor: C.okSoft, borderColor: '#C9E4DA' }]}>
        <View style={b.compareHead}>
          <Tick size={9} />
          <Text style={[b.compareTitle, { color: C.ok }]}>{yes.title}</Text>
        </View>
        {yes.items.map((s, i) => (
          <Text key={i} style={[b.compareItem, { color: '#1E5C48' }]}>{s}</Text>
        ))}
      </View>
      <View style={[b.compareCol, { backgroundColor: C.redSoft, borderColor: '#F0D2C2' }]}>
        <View style={b.compareHead}>
          <Cross size={9} />
          <Text style={[b.compareTitle, { color: C.red }]}>{no.title}</Text>
        </View>
        {no.items.map((s, i) => (
          <Text key={i} style={[b.compareItem, { color: '#8A3009' }]}>{s}</Text>
        ))}
      </View>
    </View>
  )
}

// ─── Section heading ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrap: { marginBottom: 26 },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 9 },
  numCol: { width: 34, paddingTop: 1 },
  num: { fontSize: 20, fontFamily: 'Times-Bold', color: C.mistLine },
  titleCol: { flex: 1, paddingTop: 4 },
  title: { fontSize: 14, fontFamily: 'Times-Bold', color: C.green, marginBottom: 5, lineHeight: 1.2 },
  hair: { height: 1.6, width: 26, backgroundColor: C.gold },
})

export function Section({
  num, title, children, breakBefore = false,
}: {
  num: number
  title: string
  children: React.ReactNode
  breakBefore?: boolean
}) {
  return (
    <View style={s.wrap} break={breakBefore}>
      {/* Keeps a heading from stranding itself at the foot of a page with its
          first paragraph overleaf. */}
      <View style={s.head} minPresenceAhead={46}>
        <View style={s.numCol}>
          <Text style={s.num}>{String(num).padStart(2, '0')}</Text>
        </View>
        <View style={s.titleCol}>
          <Text style={s.title}>{title}</Text>
          <View style={s.hair} />
        </View>
      </View>
      {children}
    </View>
  )
}

// ─── Cover and part dividers ───────────────────────────────────────────────────

const cov = StyleSheet.create({
  // flex:1 is load-bearing, not cosmetic. The gold frame below is positioned
  // against all four edges, and without a height to resolve `bottom` against
  // the layout produces Infinity and the renderer refuses the document.
  page: { backgroundColor: G.night, position: 'relative', flex: 1, height: '100%' },
  frame: {
    position: 'absolute', top: 26, left: 26, right: 26, bottom: 26,
    borderWidth: 0.8, borderColor: 'rgba(212,175,55,0.28)', borderRadius: 3,
  },
  inner: { flex: 1, paddingHorizontal: 62, paddingTop: 44, paddingBottom: 46 },
  // Two spacers rather than a top padding. The title block then sits on the
  // optical centre at any page size, instead of leaving a hand's width of
  // nothing between the subtitle and the plinth.
  spacerTop: { flex: 0.85 },
  markRow: { alignItems: 'center', marginBottom: 30 },
  eyebrow: {
    fontSize: 7, color: C.gold, letterSpacing: 3.4, textAlign: 'center',
    fontFamily: 'Helvetica-Bold', marginBottom: 20,
  },
  org: {
    fontSize: 25, fontFamily: 'Times-Bold', color: C.paper, textAlign: 'center',
    letterSpacing: 1.6, lineHeight: 1.25,
  },
  goldRule: { height: 1.4, backgroundColor: C.gold, width: 62, alignSelf: 'center', marginVertical: 22 },
  title: {
    fontSize: 40, fontFamily: 'Times-Bold', color: C.gold, textAlign: 'center',
    letterSpacing: 1.2, lineHeight: 1.12,
  },
  sub: {
    fontSize: 9.5, color: C.greenSoft, textAlign: 'center', marginTop: 18,
    lineHeight: 1.7, letterSpacing: 0.3, paddingHorizontal: 18,
  },
  spacer: { flex: 1 },
  plinth: {
    borderTopWidth: 0.8, borderTopColor: 'rgba(212,175,55,0.3)', paddingTop: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  plinthLabel: { fontSize: 6, color: C.greenSoft, letterSpacing: 1.6, marginBottom: 4 },
  plinthValue: { fontSize: 8, color: C.paper, fontFamily: 'Helvetica-Bold', letterSpacing: 0.6 },
  confidential: {
    fontSize: 6.2, color: 'rgba(212,175,55,0.75)', letterSpacing: 1.8, textAlign: 'center',
    marginTop: 18,
  },
})

export function Cover({
  edition, issued, holder,
}: {
  edition: string
  issued: string
  holder: string
}) {
  return (
    <View style={cov.page}>
      <View style={cov.frame} />
      <View style={cov.inner}>
        <View style={cov.spacerTop} />
        <View style={cov.markRow}><XmmMark size={88} /></View>
        <Text style={cov.eyebrow}>ESTABLISHED BY FOUR  ·  HELD BY FIFTY</Text>
        <Text style={cov.org}>XKIMM XA MALI{'\n'}FOUNDATION</Text>
        <View style={cov.goldRule} />
        <Text style={cov.title}>The Founder{'\n'}Guide</Text>
        <Text style={cov.sub}>
          Everything the Foundation asks of you, everything it owes you,{'\n'}
          and exactly how the money moves between the two.
        </Text>
        <View style={cov.spacer} />
        <View style={cov.plinth}>
          <View>
            <Text style={cov.plinthLabel}>EDITION</Text>
            <Text style={cov.plinthValue}>{edition.toUpperCase()}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={cov.plinthLabel}>ISSUED</Text>
            <Text style={cov.plinthValue}>{issued.toUpperCase()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={cov.plinthLabel}>PREPARED FOR</Text>
            <Text style={cov.plinthValue}>{holder.toUpperCase()}</Text>
          </View>
        </View>
        <Text style={cov.confidential}>CONFIDENTIAL  ·  FOR MEMBERS OF THE CIRCLE</Text>
      </View>
    </View>
  )
}

const div = StyleSheet.create({
  page: { backgroundColor: G.night, flex: 1, paddingHorizontal: 62, paddingTop: 190, position: 'relative' },
  roman: { fontSize: 8, color: C.gold, letterSpacing: 4, fontFamily: 'Helvetica-Bold', marginBottom: 16 },
  // Set behind and to the right rather than above. Stacked, its serif ran into
  // the title's first letter — 'I' against 'The Foundation' read as damage.
  numeral: {
    position: 'absolute', right: 44, top: 96,
    fontSize: 232, fontFamily: 'Times-Bold', color: 'rgba(212,175,55,0.13)', lineHeight: 1,
  },
  title: { fontSize: 31, fontFamily: 'Times-Bold', color: C.paper, marginBottom: 16, letterSpacing: 0.8 },
  rule: { height: 1.4, width: 48, backgroundColor: C.gold, marginBottom: 18 },
  lede: { fontSize: 10, color: C.greenSoft, lineHeight: 1.7, maxWidth: 330 },
  toc: { marginTop: 38, borderTopWidth: 0.6, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14 },
  tocRow: { flexDirection: 'row', marginBottom: 7, alignItems: 'baseline' },
  tocNum: { fontSize: 7.5, color: C.gold, fontFamily: 'Helvetica-Bold', width: 22, letterSpacing: 0.6 },
  tocTitle: { fontSize: 9, color: 'rgba(255,255,255,0.72)' },
})

export function PartDivider({
  roman, numeral, title, lede, sections,
}: {
  roman: string
  numeral: string
  title: string
  lede: string
  sections: { num: number; title: string }[]
}) {
  return (
    <View style={div.page}>
      <Text style={div.roman}>PART {roman.toUpperCase()}</Text>
      <Text style={div.numeral}>{numeral}</Text>
      <Text style={div.title}>{title}</Text>
      <View style={div.rule} />
      <Text style={div.lede}>{lede}</Text>
      <View style={div.toc}>
        {sections.map((sec) => (
          <View key={sec.num} style={div.tocRow}>
            <Text style={div.tocNum}>{String(sec.num).padStart(2, '0')}</Text>
            <Text style={div.tocTitle}>{sec.title}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Contents ──────────────────────────────────────────────────────────────────

const toc = StyleSheet.create({
  wrap: { paddingHorizontal: PAGE.gutter, paddingTop: 62 },
  kicker: { fontSize: 7, color: C.gold, letterSpacing: 3, fontFamily: 'Helvetica-Bold', marginBottom: 10 },
  title: { fontSize: 26, fontFamily: 'Times-Bold', color: C.green, marginBottom: 6 },
  rule: { height: 1.4, width: 44, backgroundColor: C.gold, marginBottom: 22 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 8 },
  partRoman: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.gold, letterSpacing: 1.6 },
  partTitle: { fontSize: 10, fontFamily: 'Times-Bold', color: C.green, letterSpacing: 0.4 },
  partLine: { flex: 1, height: 0.6, backgroundColor: C.mistLine },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 5.5, paddingLeft: 4 },
  num: { fontSize: 7.5, color: C.ink35, fontFamily: 'Helvetica-Bold', width: 20 },
  name: { fontSize: 9, color: C.ink70 },
  leader: { flex: 1, borderBottomWidth: 0.6, borderBottomColor: C.mistLine, borderBottomStyle: 'dotted', marginHorizontal: 5, marginBottom: 2.5 },
  hint: { fontSize: 7.5, color: C.ink35, fontFamily: 'Helvetica-Bold' },
})

export function Contents({
  parts, appendices,
}: {
  parts: { roman: string; title: string; sections: { num: number; title: string }[] }[]
  /** Listed too. A contents page that omits two pages of the document is wrong. */
  appendices: { letter: string; title: string }[]
}) {
  return (
    <View style={toc.wrap}>
      <Text style={toc.kicker}>WHAT IS IN HERE</Text>
      <Text style={toc.title}>Contents</Text>
      <View style={toc.rule} />
      {parts.map((part) => (
        <View key={part.roman} wrap={false}>
          <View style={toc.partRow}>
            <Text style={toc.partRoman}>PART {part.roman.toUpperCase()}</Text>
            <Text style={toc.partTitle}>{part.title}</Text>
            <View style={toc.partLine} />
          </View>
          {part.sections.map((sec) => (
            <View key={sec.num} style={toc.row}>
              <Text style={toc.num}>{String(sec.num).padStart(2, '0')}</Text>
              <Text style={toc.name}>{sec.title}</Text>
              <View style={toc.leader} />
            </View>
          ))}
        </View>
      ))}

      <View wrap={false}>
        <View style={toc.partRow}>
          <Text style={toc.partRoman}>AT THE BACK</Text>
          <Text style={toc.partTitle}>Appendices</Text>
          <View style={toc.partLine} />
        </View>
        {appendices.map((a) => (
          <View key={a.letter} style={toc.row}>
            <Text style={toc.num}>{a.letter}</Text>
            <Text style={toc.name}>{a.title}</Text>
            <View style={toc.leader} />
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Small decorative pieces ───────────────────────────────────────────────────

const misc = StyleSheet.create({
  seal: { alignItems: 'center', marginTop: 20 },
  sealRing: { alignItems: 'center', justifyContent: 'center' },
})

/** A gold ring around the mark, for the closing page. */
export function Seal({ size = 96 }: { size?: number }) {
  return (
    <View style={misc.seal}>
      <View style={misc.sealRing}>
        <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
          <Circle cx="50" cy="50" r="48" fill="none" stroke={C.gold} strokeWidth={0.8} strokeOpacity={0.5} />
          <Circle cx="50" cy="50" r="43" fill="none" stroke={C.gold} strokeWidth={0.4} strokeOpacity={0.3} />
          <Rect x="49.6" y="0" width="0.8" height="6" fill={C.gold} fillOpacity={0.5} />
          <Rect x="49.6" y="94" width="0.8" height="6" fill={C.gold} fillOpacity={0.5} />
          <Rect x="0" y="49.6" width="6" height="0.8" fill={C.gold} fillOpacity={0.5} />
          <Rect x="94" y="49.6" width="6" height="0.8" fill={C.gold} fillOpacity={0.5} />
        </Svg>
        <View style={{ paddingVertical: (size - size * 0.58) / 2 }}>
          <XmmMark size={size * 0.58} />
        </View>
      </View>
    </View>
  )
}
