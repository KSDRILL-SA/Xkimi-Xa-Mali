import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'
import {
  C, rands, StatusPill, Masthead, PageFooter,
  IconUsers, IconScale, IconCoins, IconWallet, IconChart, IconShield,
} from './kit'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContributionReportData = {
  period: { month: number; year: number; label: string }
  summary: {
    totalDue: number
    totalPaid: number
    outstanding: number
    collectionRate: number
    memberCount: number
    paidCount: number
    overdueCount: number
    poolTotal: number
  }
  members: Array<{
    id: string
    name: string
    email: string
    phone: string
    amountDue: number
    amountPaid: number
    outstanding: number
    status: string
  }>
  generatedAt: string
  docRef: string
  signature: { imageDataUri: string; displayName: string } | null
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.ink, backgroundColor: C.paper, paddingBottom: 64 },
  content: { paddingHorizontal: 40, paddingTop: 22 },

  hero: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingBottom: 18, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  heroLabel: { fontSize: 7, color: C.ink35, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 5 },
  heroName: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.green, letterSpacing: 0.2 },
  heroMeta: { fontSize: 7.5, color: C.ink50, marginTop: 5, letterSpacing: 0.3 },
  heroRight: { alignItems: 'flex-end' },
  heroAmountLabel: { fontSize: 7, color: C.ink35, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  heroAmount: { fontSize: 25, fontFamily: 'Helvetica-Bold', letterSpacing: 0.2 },

  summaryRow: { flexDirection: 'row', gap: 11, marginBottom: 14 },
  sumCard: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 11 },
  sumCardAccent: { backgroundColor: C.mist, borderColor: C.mistLine },
  sumTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sumLabel: { fontSize: 6.5, color: C.ink50, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.7 },
  sumValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.green },
  sumSub: { fontSize: 6.5, color: C.ink35, marginTop: 3 },

  pool: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.headerBg, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 20,
  },
  poolLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  poolLabel: { fontSize: 7, color: C.greenSoft, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
  poolCaption: { fontSize: 6.5, color: C.ink35 },
  poolValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.gold, letterSpacing: 0.3 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9, marginTop: 2 },
  sectionTick: { width: 3, height: 11, borderRadius: 1.5, backgroundColor: C.gold },
  sectionHeading: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.green, letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionCount: { fontSize: 7, color: C.ink35, marginLeft: 'auto', letterSpacing: 0.3 },

  table: { marginBottom: 18, borderWidth: 1, borderColor: C.line, borderRadius: 6, overflow: 'hidden' },
  tHead: { flexDirection: 'row', backgroundColor: C.green, paddingHorizontal: 11, paddingVertical: 7 },
  tHeadCell: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: C.paper, letterSpacing: 0.6, textTransform: 'uppercase' },
  tRow: { flexDirection: 'row', paddingHorizontal: 11, paddingVertical: 7, alignItems: 'center' },
  tRowAlt: { backgroundColor: C.mist },
  tCell: { fontSize: 8.5, color: C.ink70 },
  tCellStrong: { fontSize: 8.5, color: C.green, fontFamily: 'Helvetica-Bold' },
  tCellMuted: { fontSize: 7, color: C.ink35 },
  tTotal: { flexDirection: 'row', paddingHorizontal: 11, paddingVertical: 8, backgroundColor: C.mist, borderTopWidth: 1.5, borderTopColor: C.green },
  tTotalCell: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.green },

  cName:    { width: '26%' },
  cContact: { width: '24%' },
  cDue:     { width: '13%', textAlign: 'right' },
  cPaid:    { width: '13%', textAlign: 'right' },
  cOut:     { width: '13%', textAlign: 'right' },
  cStatus:  { width: '11%' },

  numPos: { color: C.ok, fontFamily: 'Helvetica-Bold' },
  numNeg: { color: C.red, fontFamily: 'Helvetica-Bold' },

  closeRow: { flexDirection: 'row', gap: 16, marginTop: 2 },
  notes: { flex: 1.5, backgroundColor: C.mist, borderRadius: 6, borderLeftWidth: 2.5, borderLeftColor: C.gold, padding: 11 },
  notesTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.green, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  notesText: { fontSize: 6.8, color: C.ink50, lineHeight: 1.55 },
  sign: { flex: 1, alignItems: 'flex-end', justifyContent: 'flex-end' },
  signLabel: { fontSize: 6.5, color: C.ink35, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  signImage: { width: 116, height: 42, objectFit: 'contain' },
  signRule: { width: 130, borderBottomWidth: 0.75, borderBottomColor: C.ink35, marginTop: 2, marginBottom: 4 },
  signName: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.green },
  signMeta: { fontSize: 6.5, color: C.ink50, marginTop: 2 },
  signSeal: { fontSize: 6.5, color: C.gold, fontFamily: 'Helvetica-Oblique', marginTop: 3 },
})

// ─── Document ─────────────────────────────────────────────────────────────────

function rateTone(rate: number): string {
  if (rate >= 80) return C.ok
  if (rate >= 50) return C.amber
  return C.red
}

function ReportDocument({ data }: { data: ContributionReportData }) {
  const { period, summary, members, generatedAt, docRef, signature } = data
  const collColor = rateTone(summary.collectionRate)
  const goodRate = summary.collectionRate >= 80

  return (
    <Document
      title={`Xkimm Xa Mali Foundation — Contribution Report — ${period.label}`}
      author="Xkimm Xa Mali Foundation"
      subject="Monthly Group Contribution Report"
      creator="Xkimm Xa Mali Foundation Platform"
      keywords="report contribution group savings xkimm"
    >
      <Page size="A4" style={s.page}>
        <Masthead docType="Contribution Report" period={period.label} docRef={docRef} />

        <View style={s.content}>

          {/* ── Hero ─────────────────────────────────── */}
          <View style={s.hero}>
            <View>
              <Text style={s.heroLabel}>Group Report</Text>
              <Text style={s.heroName}>Monthly Contribution Report</Text>
              <Text style={s.heroMeta}>{period.label}  ·  {summary.memberCount} active member{summary.memberCount === 1 ? '' : 's'}</Text>
              <View style={{ marginTop: 8 }}>
                <StatusPill status={goodRate ? 'PAID' : summary.collectionRate >= 50 ? 'PARTIAL' : 'OVERDUE'} label={`${summary.collectionRate}% collected`} />
              </View>
            </View>
            <View style={s.heroRight}>
              <Text style={s.heroAmountLabel}>Collection Rate</Text>
              <Text style={[s.heroAmount, { color: collColor }]}>{summary.collectionRate}%</Text>
              <Text style={[s.heroMeta, { textAlign: 'right' }]}>{summary.paidCount} of {summary.memberCount} fully paid</Text>
            </View>
          </View>

          {/* ── Summary cards ────────────────────────── */}
          <View style={s.summaryRow}>
            <View style={s.sumCard}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Members</Text><IconUsers size={11} color={C.greenSoft} /></View>
              <Text style={s.sumValue}>{summary.memberCount}</Text>
              <Text style={s.sumSub}>active enrolled</Text>
            </View>
            <View style={s.sumCard}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Total Due</Text><IconScale size={11} color={C.greenSoft} /></View>
              <Text style={s.sumValue}>{rands(summary.totalDue)}</Text>
              <Text style={s.sumSub}>billed this period</Text>
            </View>
            <View style={s.sumCard}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Collected</Text><IconCoins size={11} color={C.greenSoft} /></View>
              <Text style={s.sumValue}>{rands(summary.totalPaid)}</Text>
              <Text style={s.sumSub}>received</Text>
            </View>
            <View style={[s.sumCard, summary.outstanding > 0 ? { borderColor: C.redSoft, backgroundColor: C.redSoft } : {}]}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Outstanding</Text><IconWallet size={11} color={summary.outstanding > 0 ? C.red : C.greenSoft} /></View>
              <Text style={[s.sumValue, summary.outstanding > 0 ? { color: C.red } : {}]}>{rands(summary.outstanding)}</Text>
              <Text style={s.sumSub}>{summary.overdueCount} overdue</Text>
            </View>
            <View style={[s.sumCard, s.sumCardAccent]}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Rate</Text><IconChart size={11} color={C.gold} /></View>
              <Text style={[s.sumValue, { color: collColor }]}>{summary.collectionRate}%</Text>
              <Text style={s.sumSub}>of target</Text>
            </View>
          </View>

          {/* ── Group pool callout ───────────────────── */}
          <View style={s.pool}>
            <View style={s.poolLeft}>
              <IconShield size={16} color={C.gold} />
              <View>
                <Text style={s.poolLabel}>Total Group Pool</Text>
                <Text style={s.poolCaption}>All contributions collected to date across the brotherhood</Text>
              </View>
            </View>
            <Text style={s.poolValue}>{rands(summary.poolTotal)}</Text>
          </View>

          {/* ── Members table ────────────────────────── */}
          <View style={s.sectionRow}>
            <View style={s.sectionTick} />
            <Text style={s.sectionHeading}>Member Breakdown</Text>
            <Text style={s.sectionCount}>{members.length} member{members.length === 1 ? '' : 's'}</Text>
          </View>
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.tHeadCell, s.cName]}>Member</Text>
              <Text style={[s.tHeadCell, s.cContact]}>Contact</Text>
              <Text style={[s.tHeadCell, s.cDue]}>Due</Text>
              <Text style={[s.tHeadCell, s.cPaid]}>Paid</Text>
              <Text style={[s.tHeadCell, s.cOut]}>Outstanding</Text>
              <Text style={[s.tHeadCell, s.cStatus]}>Status</Text>
            </View>
            {members.length === 0 ? (
              <View style={{ paddingHorizontal: 11, paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ fontSize: 8, color: C.ink35 }}>No active members for this period.</Text>
              </View>
            ) : members.map((m, i) => (
              <View key={m.id} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                <Text style={[s.tCellStrong, s.cName]}>{m.name}</Text>
                <Text style={[s.tCellMuted, s.cContact]}>{m.phone || m.email}</Text>
                <Text style={[s.tCell, s.cDue]}>{rands(m.amountDue)}</Text>
                <Text style={[s.tCell, s.cPaid]}>{rands(m.amountPaid)}</Text>
                <Text style={[s.cOut, m.outstanding > 0 ? s.numNeg : s.numPos]}>{rands(m.outstanding)}</Text>
                <View style={s.cStatus}><StatusPill status={m.status === 'NO_RECORD' ? 'WAIVED' : m.status} label={m.status === 'NO_RECORD' ? 'No record' : m.status} /></View>
              </View>
            ))}
            <View style={s.tTotal}>
              <Text style={[s.tTotalCell, s.cName]}>TOTAL</Text>
              <Text style={[s.tTotalCell, s.cContact]} />
              <Text style={[s.tTotalCell, s.cDue]}>{rands(summary.totalDue)}</Text>
              <Text style={[s.tTotalCell, s.cPaid]}>{rands(summary.totalPaid)}</Text>
              <Text style={[s.tTotalCell, s.cOut, summary.outstanding > 0 ? { color: C.red } : {}]}>{rands(summary.outstanding)}</Text>
              <Text style={[s.tTotalCell, s.cStatus]} />
            </View>
          </View>

          {/* ── Notes + signature ────────────────────── */}
          <View style={s.closeRow}>
            <View style={s.notes}>
              <Text style={s.notesTitle}>About This Report</Text>
              <Text style={s.notesText}>
                This report summarises group contribution activity for {period.label} on the Xkimm Xa Mali Foundation
                private group-savings platform. Figures reflect records at the time of generation; all amounts are in
                South African Rand (ZAR). This is an internal administrative document — handle in confidence.
                Generated electronically and authorised below.
              </Text>
            </View>
            <View style={s.sign}>
              <Text style={s.signLabel}>Authorised By</Text>
              {signature ? (
                <>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img */}
                  <Image src={signature.imageDataUri} style={s.signImage} />
                  <View style={s.signRule} />
                  <Text style={s.signName}>{signature.displayName}</Text>
                </>
              ) : (
                <>
                  <View style={{ height: 30 }} />
                  <View style={s.signRule} />
                  <Text style={s.signName}>Xkimm Xa Mali Foundation Administration</Text>
                </>
              )}
              <Text style={s.signMeta}>Generated {generatedAt}</Text>
              {/* No decorative glyph. U+2726 is outside WinAnsi, which is all the
                  standard PDF fonts carry, so react-pdf rendered it as a
                  fallback box — a broken character sitting beside the words
                  "Official Document" on an authorisation block. */}
              <Text style={s.signSeal}>Official Document</Text>
            </View>
          </View>

        </View>

        <PageFooter docRef={docRef} />
      </Page>
    </Document>
  )
}

export async function renderContributionReportPDF(data: ContributionReportData): Promise<Buffer> {
  return renderToBuffer(<ReportDocument data={data} />)
}
