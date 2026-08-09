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
  IconUser, IconBank, IconScale, IconCoins, IconWallet, IconShield,
} from './kit'

// ─── Types ───────────────────────────────────────────────────────────────────

export type StatementData = {
  member: {
    firstName: string
    lastName: string
    email: string
    phone: string
    memberId: string
    memberSince: string
    /**
     * Conferred, never earned. Printed beside the name, not in place of any
     * badge tier — the statement does not show a tier at all, so there is
     * nothing here for it to be confused with.
     */
    isFounder?: boolean
  }
  banking: {
    bankName: string
    accountNumberMasked: string
    accountType: string
    branchCode: string
    verified: boolean
  } | null
  period: {
    month: number
    year: number
    label: string
  }
  contributions: Array<{
    id: string
    periodLabel: string
    amountDue: number
    amountPaid: number
    status: string
    dueDate: string
  }>
  transactions: Array<{
    id: string
    amount: number
    type: string
    status: string
    gatewayRef: string | null
    processedAt: string | null
    createdAt: string
  }>
  summary: {
    totalDue: number
    totalPaid: number
    outstanding: number
  }
  generatedAt: string
  docRef: string
  signature: {
    imageDataUri: string
    displayName: string
  } | null
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.ink,
    backgroundColor: C.paper,
    paddingBottom: 46,
  },

  // ── Masthead ──────────────────────────────────────────────────────────
  masthead: {
    backgroundColor: C.headerBg,
    paddingHorizontal: 40,
    paddingTop: 21,
    paddingBottom: 19,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  monogram: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  monogramText: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.gold },
  orgName: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.paper, letterSpacing: 1.5 },
  orgTagline: { fontSize: 6.5, color: C.greenSoft, marginTop: 3, letterSpacing: 1.2, textTransform: 'uppercase' },
  mastRight: { alignItems: 'flex-end' },
  docType: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.paper, letterSpacing: 2.5, textTransform: 'uppercase' },
  docPeriod: { fontSize: 8.5, color: C.gold, marginTop: 5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  docRef: { fontSize: 6.5, color: C.ink35, marginTop: 3, letterSpacing: 0.5 },
  accentBar: { height: 3, backgroundColor: C.gold },
  accentBarShade: { height: 1.5, backgroundColor: C.greenMid },

  // ── Hero ──────────────────────────────────────────────────────────────
  content: { paddingHorizontal: 40, paddingTop: 22 },
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingBottom: 15,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  heroLabel: { fontSize: 7, color: C.ink35, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 5 },
  heroName: { fontSize: 21, fontFamily: 'Helvetica-Bold', color: C.green, letterSpacing: 0.2 },
  heroMeta: { fontSize: 7.5, color: C.ink50, marginTop: 5, letterSpacing: 0.3 },
  founderPill: {
    marginTop: 5,
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    backgroundColor: C.goldSoft,
    borderWidth: 0.6,
    borderColor: C.gold,
  },
  founderPillText: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    color: C.gold,
  },
  heroRight: { alignItems: 'flex-end' },
  heroAmountLabel: { fontSize: 7, color: C.ink35, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 3 },
  heroAmount: { fontSize: 25, fontFamily: 'Helvetica-Bold', letterSpacing: 0.2 },

  // ── Status pill ───────────────────────────────────────────────────────
  pill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 4 },
  pillText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', letterSpacing: 0.4 },

  // ── Info grid ─────────────────────────────────────────────────────────
  grid: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  card: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 6, overflow: 'hidden' },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.mist, paddingHorizontal: 12, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: C.mistLine,
  },
  cardHeadText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.green, textTransform: 'uppercase', letterSpacing: 1.1 },
  cardBody: { paddingHorizontal: 12, paddingVertical: 11 },
  kv: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  kvLast: { flexDirection: 'row', alignItems: 'flex-start' },
  kvLabel: { fontSize: 7.5, color: C.ink35, width: 78, letterSpacing: 0.2 },
  kvValue: { fontSize: 8.5, color: C.ink70, flex: 1, fontFamily: 'Helvetica-Bold' },


  // ── Summary cards ─────────────────────────────────────────────────────
  summaryRow: { flexDirection: 'row', gap: 11, marginBottom: 14 },
  sumCard: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 6, padding: 14, backgroundColor: C.paper },
  sumCardAccent: { backgroundColor: C.mist, borderColor: C.mistLine },
  sumTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sumLabel: { fontSize: 6.5, color: C.ink50, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.7 },
  sumValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.green },
  sumSub: { fontSize: 6.5, color: C.ink35, marginTop: 3 },

  // ── Section heading ───────────────────────────────────────────────────
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 9, marginTop: 2 },
  sectionTick: { width: 3, height: 11, borderRadius: 1.5, backgroundColor: C.gold },
  sectionHeading: { fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: C.green, letterSpacing: 0.8, textTransform: 'uppercase' },
  sectionCount: { fontSize: 7, color: C.ink35, marginLeft: 'auto', letterSpacing: 0.3 },

  // ── Table ─────────────────────────────────────────────────────────────
  table: { marginBottom: 13, borderWidth: 1, borderColor: C.line, borderRadius: 6, overflow: 'hidden' },
  tHead: { flexDirection: 'row', backgroundColor: C.green, paddingHorizontal: 13, paddingVertical: 9 },
  tHeadCell: { fontSize: 6.8, fontFamily: 'Helvetica-Bold', color: C.paper, letterSpacing: 0.6, textTransform: 'uppercase' },
  tRow: { flexDirection: 'row', paddingHorizontal: 13, paddingVertical: 10, alignItems: 'center' },
  tRowAlt: { backgroundColor: C.mist },
  tCell: { fontSize: 8.5, color: C.ink70 },
  tCellStrong: { fontSize: 8.5, color: C.green, fontFamily: 'Helvetica-Bold' },
  tCellMuted: { fontSize: 7.5, color: C.ink35 },
  tEmpty: { paddingHorizontal: 11, paddingVertical: 18, alignItems: 'center' },
  tEmptyText: { fontSize: 8, color: C.ink35 },

  // Contributions columns
  // Every column carries horizontal padding. The widths summed to exactly
  // 100% with none, so a right-aligned value ended flush against the next
  // column's left edge and the headers rendered as "OUTSTANDINGSTATUS".
  cPeriod:  { width: '20%', paddingRight: 6 },
  cDue:     { width: '15%', textAlign: 'right', paddingRight: 8 },
  cPaid:    { width: '15%', textAlign: 'right', paddingRight: 8 },
  cBalance: { width: '17%', textAlign: 'right', paddingRight: 10 },
  cStatus:  { width: '16%', paddingRight: 6 },
  cDate:    { width: '17%', textAlign: 'right' },
  // Transactions columns
  tDate:    { width: '14%', paddingRight: 6 },
  tDesc:    { width: '22%', paddingRight: 6 },
  tRef:     { width: '22%', paddingRight: 6 },
  tAmount:  { width: '14%', textAlign: 'right', paddingRight: 10 },
  tStatus:  { width: '14%', paddingRight: 6 },
  tProc:    { width: '14%', textAlign: 'right' },

  numPos: { color: C.ok, fontFamily: 'Helvetica-Bold' },
  numNeg: { color: C.red, fontFamily: 'Helvetica-Bold' },

  // ── Notes + signature ─────────────────────────────────────────────────
  closeRow: { flexDirection: 'row', gap: 16, marginTop: 2 },
  notes: {
    flex: 1.5,
    backgroundColor: C.mist,
    borderRadius: 6,
    borderLeftWidth: 2.5,
    borderLeftColor: C.gold,
    padding: 9,
  },
  notesTitle: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.green, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  notesText: { fontSize: 6.8, color: C.ink50, lineHeight: 1.45 },
  // Fixed width and no cross-axis stretch. With `flex: 1` and
  // `justifyContent: 'flex-end'` this view stretched to the height available
  // rather than to its content, so the block it sits in *measured* far taller
  // than it drew — and `wrap={false}` then decided it could not fit and pushed
  // the whole notice and authorisation onto a page of its own, which is why
  // every statement ran to two pages with the second one almost empty.
  sign: { width: 200, alignItems: 'flex-end' },
  signLabel: { fontSize: 6.5, color: C.ink35, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  signImage: { width: 116, height: 42, objectFit: 'contain' },
  signRule: { width: 130, borderBottomWidth: 0.75, borderBottomColor: C.ink35, marginTop: 2, marginBottom: 4 },
  signName: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.green },
  signMeta: { fontSize: 6.5, color: C.ink50, marginTop: 2 },
  signSeal: { fontSize: 6.5, color: C.gold, fontFamily: 'Helvetica-Oblique', marginTop: 3 },

  // ── Footer ────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopWidth: 2, borderTopColor: C.gold,
    backgroundColor: C.headerBg,
    paddingHorizontal: 40, paddingVertical: 9,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  fLeft: { fontSize: 6.5, color: C.greenSoft, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  fCenter: { fontSize: 6, color: C.ink35, letterSpacing: 0.3 },
  fRight: { fontSize: 6.5, color: C.greenSoft, letterSpacing: 0.3 },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function txDescription(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Document ─────────────────────────────────────────────────────────────────

function StatementDocument({ data }: { data: StatementData }) {
  const { member, banking, period, contributions, transactions, summary, generatedAt, docRef, signature } = data
  const fullyPaid = summary.outstanding <= 0

  return (
    <Document
      title={`Xkimm Xa Mali Foundation — Statement — ${member.firstName} ${member.lastName} — ${period.label}`}
      author="Xkimm Xa Mali Foundation"
      subject="Contribution Statement of Account"
      creator="Xkimm Xa Mali Foundation Platform"
      keywords="statement contribution savings xkimm"
    >
      <Page size="A4" style={s.page}>

        <Masthead docType="Statement of Account" period={period.label} docRef={docRef} />

        <View style={s.content}>

          {/* ── Hero ─────────────────────────────────── */}
          <View style={s.hero}>
            <View>
              <Text style={s.heroLabel}>Account Holder</Text>
              <Text style={s.heroName}>{member.firstName} {member.lastName}</Text>
              {/* react-pdf has its own element set, so the web FounderMark
                  component cannot be reused here. The data source is shared;
                  only the rendering is duplicated. */}
              {member.isFounder ? (
                <View style={s.founderPill}>
                  <Text style={s.founderPillText}>FOUNDER</Text>
                </View>
              ) : null}
              <Text style={s.heroMeta}>{member.memberId}  ·  Issued {generatedAt}</Text>
              <View style={{ marginTop: 8 }}>
                <View style={[s.pill, { backgroundColor: fullyPaid ? C.okSoft : C.amberSoft }]}>
                  <View style={[s.pillDot, { backgroundColor: fullyPaid ? C.ok : C.amber }]} />
                  <Text style={[s.pillText, { color: fullyPaid ? C.ok : C.amber }]}>
                    {fullyPaid ? 'ACCOUNT SETTLED' : 'BALANCE OUTSTANDING'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={s.heroRight}>
              <Text style={s.heroAmountLabel}>{fullyPaid ? 'Total Paid' : 'Outstanding Balance'}</Text>
              <Text style={[s.heroAmount, { color: fullyPaid ? C.green : C.red }]}>
                {rands(fullyPaid ? summary.totalPaid : summary.outstanding)}
              </Text>
              <Text style={[s.heroMeta, { textAlign: 'right' }]}>for {period.label}</Text>
            </View>
          </View>

          {/* ── Info grid ────────────────────────────── */}
          {/* Two panels, not three.
              This was Member Details and Statement Details side by side, then
              a full-width banking band beneath — three bordered boxes of
              key-values stacked before any of the actual content, which is
              what made the page feel packed.

              Statement Details is gone: the document reference is already in
              the masthead, the period is in the masthead and again beneath the
              headline amount, and "Group Savings — Monthly" is the same
              sentence on every statement ever issued. Only the issue date
              carried information, and it now sits with the account holder. */}
          <View style={s.grid}>
            <View style={s.card}>
              <View style={s.cardHead}><IconUser size={9} /><Text style={s.cardHeadText}>Member Details</Text></View>
              <View style={s.cardBody}>
                <View style={s.kv}><Text style={s.kvLabel}>Email</Text><Text style={s.kvValue}>{member.email}</Text></View>
                <View style={s.kv}><Text style={s.kvLabel}>Mobile</Text><Text style={s.kvValue}>{member.phone}</Text></View>
                <View style={s.kvLast}><Text style={s.kvLabel}>Member Since</Text><Text style={s.kvValue}>{member.memberSince}</Text></View>
              </View>
            </View>
            {banking ? (
              <View style={s.card}>
                <View style={s.cardHead}><IconBank size={9} /><Text style={s.cardHeadText}>Debit Account</Text></View>
                <View style={s.cardBody}>
                  <View style={s.kv}><Text style={s.kvLabel}>Bank</Text><Text style={s.kvValue}>{banking.bankName}</Text></View>
                  <View style={s.kv}><Text style={s.kvLabel}>Account</Text><Text style={s.kvValue}>{banking.accountNumberMasked}</Text></View>
                  <View style={s.kv}><Text style={s.kvLabel}>Branch Code</Text><Text style={s.kvValue}>{banking.branchCode}</Text></View>
                  <View style={s.kvLast}>
                    <Text style={s.kvLabel}>Status</Text>
                    <Text style={[s.kvValue, { color: banking.verified ? C.ok : C.red }]}>
                      {banking.accountType} · {banking.verified ? 'Verified' : 'Unverified'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>

          {/* ── Summary cards ────────────────────────── */}
          <View style={s.summaryRow}>
            <View style={s.sumCard}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Total Due</Text><IconScale size={11} color={C.greenSoft} /></View>
              <Text style={s.sumValue}>{rands(summary.totalDue)}</Text>
              <Text style={s.sumSub}>billed this period</Text>
            </View>
            <View style={s.sumCard}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Total Paid</Text><IconCoins size={11} color={C.greenSoft} /></View>
              <Text style={s.sumValue}>{rands(summary.totalPaid)}</Text>
              <Text style={s.sumSub}>received & settled</Text>
            </View>
            <View style={[s.sumCard, fullyPaid ? {} : { borderColor: C.redSoft, backgroundColor: C.redSoft }]}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Outstanding</Text><IconWallet size={11} color={fullyPaid ? C.greenSoft : C.red} /></View>
              <Text style={[s.sumValue, fullyPaid ? {} : { color: C.red }]}>{rands(summary.outstanding)}</Text>
              <Text style={s.sumSub}>{fullyPaid ? 'fully settled' : 'balance due'}</Text>
            </View>
            <View style={[s.sumCard, s.sumCardAccent]}>
              <View style={s.sumTop}><Text style={s.sumLabel}>Period Status</Text><IconShield size={11} color={C.gold} /></View>
              <Text style={[s.sumValue, { color: fullyPaid ? C.green : C.amber }]}>{fullyPaid ? 'PAID' : 'OPEN'}</Text>
              <Text style={s.sumSub}>{period.label}</Text>
            </View>
          </View>

          {/* ── Contributions ────────────────────────── */}
          <View style={s.sectionRow}>
            <View style={s.sectionTick} />
            <Text style={s.sectionHeading}>Contributions</Text>
            <Text style={s.sectionCount}>{contributions.length} record{contributions.length === 1 ? '' : 's'}</Text>
          </View>
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.tHeadCell, s.cPeriod]}>Period</Text>
              <Text style={[s.tHeadCell, s.cDue]}>Due</Text>
              <Text style={[s.tHeadCell, s.cPaid]}>Paid</Text>
              <Text style={[s.tHeadCell, s.cBalance]}>Outstanding</Text>
              <Text style={[s.tHeadCell, s.cStatus]}>Status</Text>
              <Text style={[s.tHeadCell, s.cDate]}>Due Date</Text>
            </View>
            {contributions.length === 0 ? (
              <View style={s.tEmpty}><Text style={s.tEmptyText}>No contributions recorded for this period.</Text></View>
            ) : contributions.map((c, i) => {
              const bal = Math.max(0, c.amountDue - c.amountPaid)
              return (
                <View key={c.id} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                  <Text style={[s.tCellStrong, s.cPeriod]}>{c.periodLabel}</Text>
                  <Text style={[s.tCell, s.cDue]}>{rands(c.amountDue)}</Text>
                  <Text style={[s.tCell, s.cPaid]}>{rands(c.amountPaid)}</Text>
                  <Text style={[s.cBalance, bal > 0 ? s.numNeg : s.numPos]}>{rands(bal)}</Text>
                  <View style={s.cStatus}><StatusPill status={c.status} /></View>
                  <Text style={[s.tCellMuted, s.cDate]}>{c.dueDate}</Text>
                </View>
              )
            })}
          </View>

          {/* ── Transactions ─────────────────────────── */}
          <View style={s.sectionRow}>
            <View style={s.sectionTick} />
            <Text style={s.sectionHeading}>Transaction History</Text>
            <Text style={s.sectionCount}>{transactions.length} record{transactions.length === 1 ? '' : 's'}</Text>
          </View>
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.tHeadCell, s.tDate]}>Date</Text>
              <Text style={[s.tHeadCell, s.tDesc]}>Description</Text>
              <Text style={[s.tHeadCell, s.tRef]}>Reference</Text>
              <Text style={[s.tHeadCell, s.tAmount]}>Amount</Text>
              <Text style={[s.tHeadCell, s.tStatus]}>Status</Text>
              <Text style={[s.tHeadCell, s.tProc]}>Processed</Text>
            </View>
            {transactions.length === 0 ? (
              <View style={s.tEmpty}><Text style={s.tEmptyText}>No transactions recorded for this period.</Text></View>
            ) : transactions.map((t, i) => (
              <View key={t.id} style={[s.tRow, i % 2 === 1 ? s.tRowAlt : {}]} wrap={false}>
                <Text style={[s.tCell, s.tDate]}>{t.createdAt}</Text>
                <Text style={[s.tCellStrong, s.tDesc]}>{txDescription(t.type)}</Text>
                <Text style={[s.tCellMuted, s.tRef]}>{t.gatewayRef ?? '—'}</Text>
                <Text style={[s.tCellStrong, s.tAmount]}>{rands(t.amount)}</Text>
                <View style={s.tStatus}><StatusPill status={t.status} /></View>
                <Text style={[s.tCellMuted, s.tProc]}>{t.processedAt ?? '—'}</Text>
              </View>
            ))}
          </View>

          {/* ── Notes + signature ────────────────────── */}
          {/* Kept whole. Without this the notice and the authorisation split
              across the page break, so the text ran off the bottom of page one
              and the signature landed alone on page two. */}
          <View style={s.closeRow} wrap={false}>
            <View style={s.notes}>
              <Text style={s.notesTitle}>Important Notice</Text>
              <Text style={s.notesText}>
                Issued for the named account holder. All amounts are in South African Rand (ZAR).
                If any detail appears incorrect, contact your group administrator immediately.
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
                  {/* Standing room for a signature. Enough to read as a signing
                      line, small enough that the closing block clears the page
                      break — see the note on `sign` above. */}
                  <View style={{ height: 14 }} />
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

export async function renderStatementPDF(data: StatementData): Promise<Buffer> {
  return renderToBuffer(<StatementDocument data={data} />)
}
