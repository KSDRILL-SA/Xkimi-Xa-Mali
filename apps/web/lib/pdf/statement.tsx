import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer'

// ─── Types ───────────────────────────────────────────────────────────────────

export type StatementData = {
  member: {
    firstName: string
    lastName: string
    email: string
    phone: string
    memberId: string
    memberSince: string
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  headerBg:    '#0D2818',
  green:       '#1B4332',
  greenMid:    '#2D6A4F',
  greenLight:  '#D1FAE5',
  greenBg:     '#F0F7F3',
  gold:        '#C9A227',
  goldLight:   '#FEF3C7',
  white:       '#FFFFFF',
  gray50:      '#F9FAFB',
  gray100:     '#F3F4F6',
  gray200:     '#E5E7EB',
  gray400:     '#9CA3AF',
  gray500:     '#6B7280',
  gray700:     '#374151',
  gray900:     '#111827',
  red:         '#DC2626',
  redLight:    '#FEE2E2',
  amber:       '#D97706',
  amberLight:  '#FEF3C7',
  sky:         '#0284C7',
  skyLight:    '#E0F2FE',
  settled:     '#059669',
  settledBg:   '#D1FAE5',
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: C.gray900,
    backgroundColor: C.white,
    paddingTop: 0,
    paddingBottom: 52,
    paddingHorizontal: 0,
  },

  // ── Header band ──────────────────────────────────────────────────────
  header: {
    backgroundColor: C.headerBg,
    paddingHorizontal: 36,
    paddingTop: 22,
    paddingBottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flexDirection: 'column' },
  orgName: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    letterSpacing: 0.5,
  },
  orgTagline: {
    fontSize: 7.5,
    color: C.gold,
    fontFamily: 'Helvetica-Oblique',
    marginTop: 3,
    letterSpacing: 0.3,
  },
  headerRight: { alignItems: 'flex-end' },
  docType: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  docPeriod: { fontSize: 9, color: C.gold, marginTop: 3, fontFamily: 'Helvetica-Bold' },
  docRef: { fontSize: 7, color: C.gray400, marginTop: 3, letterSpacing: 0.3 },

  // ── Gold accent line under header ─────────────────────────────────────
  accentBar: {
    height: 3,
    backgroundColor: C.gold,
  },

  // ── Content wrapper ───────────────────────────────────────────────────
  content: { paddingHorizontal: 36, paddingTop: 20 },

  // ── Two-column info section ───────────────────────────────────────────
  infoRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  infoBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 4,
    overflow: 'hidden',
  },
  infoBoxHeader: {
    backgroundColor: C.green,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  infoBoxTitle: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoBoxBody: { padding: 10 },
  infoName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: C.green,
    marginBottom: 4,
  },
  infoRow2: { flexDirection: 'row', marginBottom: 3 },
  infoLabel: { fontSize: 7.5, color: C.gray400, width: 70 },
  infoValue: { fontSize: 7.5, color: C.gray700, flex: 1 },

  // ── Banking details band ──────────────────────────────────────────────
  bankingBox: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 18,
  },
  bankingBody: {
    flexDirection: 'row',
    padding: 10,
    gap: 10,
  },
  bankingCol: { flex: 1 },
  bankingColLabel: {
    fontSize: 6.5,
    color: C.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bankingColValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.green },

  // ── Four-column financial summary ─────────────────────────────────────
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 4,
    padding: 10,
    alignItems: 'center',
  },
  summaryCardGreen: { backgroundColor: C.greenBg, borderColor: C.greenMid },
  summaryCardAmber: { backgroundColor: C.amberLight, borderColor: C.amber },
  summaryCardRed:   { backgroundColor: C.redLight,  borderColor: C.red   },
  summaryCardGold:  { backgroundColor: C.goldLight,  borderColor: C.gold  },
  summaryCardLabel: {
    fontSize: 6.5,
    color: C.gray400,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 5,
    textAlign: 'center',
  },
  summaryCardValue: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: C.green,
    textAlign: 'center',
  },
  summaryCardValueAmber: { color: C.amber },
  summaryCardValueRed:   { color: C.red   },
  summaryCardValueGold:  { color: C.gold  },
  summaryCardSub: { fontSize: 6.5, color: C.gray400, marginTop: 3, textAlign: 'center' },

  // ── Section heading ───────────────────────────────────────────────────
  sectionHeading: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.green,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 4,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: C.green,
  },

  // ── Table ─────────────────────────────────────────────────────────────
  table: { marginBottom: 16 },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: C.green,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tableHeadCell: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
    color: C.white,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  tableRowAlt: { backgroundColor: C.gray50 },
  tableCell: { fontSize: 8, color: C.gray700 },
  tableCellMuted: { fontSize: 7.5, color: C.gray400 },
  tableEmpty: {
    paddingHorizontal: 8,
    paddingVertical: 14,
    backgroundColor: C.gray50,
    borderRadius: 3,
    alignItems: 'center',
  },
  tableEmptyText: { fontSize: 8, color: C.gray400 },

  // ── Column widths ─────────────────────────────────────────────────────
  // Contributions
  cPeriod:  { width: '22%' },
  cDue:     { width: '18%', textAlign: 'right' },
  cPaid:    { width: '18%', textAlign: 'right' },
  cBalance: { width: '18%', textAlign: 'right' },
  cStatus:  { width: '14%', textAlign: 'center' },
  cDate:    { width: '10%', textAlign: 'right' },
  // Transactions
  tDate:    { width: '14%' },
  tDesc:    { width: '28%' },
  tRef:     { width: '22%' },
  tAmount:  { width: '14%', textAlign: 'right' },
  tStatus:  { width: '12%', textAlign: 'center' },
  tProc:    { width: '10%', textAlign: 'right' },

  // ── Status text colours ───────────────────────────────────────────────
  sPaid:     { color: C.settled,  fontFamily: 'Helvetica-Bold' },
  sPending:  { color: C.amber },
  sOverdue:  { color: C.red,     fontFamily: 'Helvetica-Bold' },
  sFailed:   { color: C.red,     fontFamily: 'Helvetica-Bold' },
  sPartial:  { color: C.sky },
  sWaived:   { color: C.gray400 },
  sDefault:  { color: C.gray500 },

  // ── Fixed footer (every page) ─────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderTopColor: C.headerBg,
    backgroundColor: C.gray50,
    paddingHorizontal: 36,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLeft:   { flex: 1 },
  footerCenter: { flex: 1, alignItems: 'center' },
  footerRight:  { flex: 1, alignItems: 'flex-end' },
  footerText:   { fontSize: 6.5, color: C.gray400 },
  footerBold:   { fontSize: 6.5, color: C.gray500, fontFamily: 'Helvetica-Bold' },
  footerGold:   { fontSize: 6.5, color: C.gold,   fontFamily: 'Helvetica-BoldOblique' },

  // ── Disclaimer strip ──────────────────────────────────────────────────
  disclaimer: {
    marginHorizontal: 36,
    marginBottom: 8,
    padding: 8,
    backgroundColor: C.greenBg,
    borderRadius: 3,
    borderLeftWidth: 3,
    borderLeftColor: C.green,
  },
  disclaimerText: { fontSize: 6.5, color: C.gray500, lineHeight: 1.5 },

  // ── Authorisation / signature block ───────────────────────────────────
  signatureBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.gray200,
    alignItems: 'flex-end',
  },
  signatureLabel: {
    fontSize: 7,
    color: C.gray400,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  signatureImage: {
    width: 110,
    height: 40,
    objectFit: 'contain',
  },
  signatureName: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: C.green,
    marginTop: 4,
  },
  signatureDate: {
    fontSize: 7,
    color: C.gray500,
    marginTop: 2,
  },
  verificationText: {
    fontSize: 6.5,
    color: C.gold,
    fontFamily: 'Helvetica-Oblique',
    marginTop: 2,
  },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rands(amount: number): string {
  return `R ${amount
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

function statusStyle(status: string) {
  switch (status.toUpperCase()) {
    case 'PAID':       case 'SUCCESS':    return s.sPaid
    case 'PENDING':    case 'PROCESSING': return s.sPending
    case 'OVERDUE':                       return s.sOverdue
    case 'FAILED':     case 'REVERSED':   return s.sFailed
    case 'PARTIAL':                       return s.sPartial
    case 'WAIVED':                        return s.sWaived
    default:                              return s.sDefault
  }
}

function txDescription(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─── Document ─────────────────────────────────────────────────────────────────

function StatementDocument({ data }: { data: StatementData }) {
  const { member, banking, period, contributions, transactions, summary, generatedAt, docRef, signature } = data
  const fullyPaid = summary.outstanding <= 0

  return (
    <Document
      title={`Xkimm Xa Mali — Statement — ${member.firstName} ${member.lastName} — ${period.label}`}
      author="Xkimm Xa Mali"
      subject="Contribution Statement of Account"
      creator="Xkimm Xa Mali Platform"
      keywords="statement contribution savings xkimm"
    >
      <Page size="A4" style={s.page}>

        {/* ── Header band ────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.orgName}>Xkimm Xa Mali</Text>
            <Text style={s.orgTagline}>&ldquo;Blessed is the hand that giveth.&rdquo; — Acts 20:35</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docType}>Statement of Account</Text>
            <Text style={s.docPeriod}>{period.label}</Text>
            <Text style={s.docRef}>REF: {docRef}</Text>
          </View>
        </View>
        <View style={s.accentBar} />

        <View style={s.content}>

          {/* ── Account holder + Statement details ───── */}
          <View style={s.infoRow}>
            {/* Account holder */}
            <View style={s.infoBox}>
              <View style={s.infoBoxHeader}>
                <Text style={s.infoBoxTitle}>Account Holder</Text>
              </View>
              <View style={s.infoBoxBody}>
                <Text style={s.infoName}>{member.firstName} {member.lastName}</Text>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Member ID</Text>
                  <Text style={s.infoValue}>{member.memberId}</Text>
                </View>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Email</Text>
                  <Text style={s.infoValue}>{member.email}</Text>
                </View>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Mobile</Text>
                  <Text style={s.infoValue}>{member.phone}</Text>
                </View>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Member Since</Text>
                  <Text style={s.infoValue}>{member.memberSince}</Text>
                </View>
              </View>
            </View>

            {/* Statement details */}
            <View style={s.infoBox}>
              <View style={s.infoBoxHeader}>
                <Text style={s.infoBoxTitle}>Statement Details</Text>
              </View>
              <View style={s.infoBoxBody}>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Period</Text>
                  <Text style={s.infoValue}>{period.label}</Text>
                </View>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Issued On</Text>
                  <Text style={s.infoValue}>{generatedAt}</Text>
                </View>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Document Ref</Text>
                  <Text style={s.infoValue}>{docRef}</Text>
                </View>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Account Status</Text>
                  <Text style={[s.infoValue, fullyPaid ? s.sPaid : s.sOverdue]}>
                    {fullyPaid ? 'SETTLED ✓' : 'OUTSTANDING'}
                  </Text>
                </View>
                <View style={s.infoRow2}>
                  <Text style={s.infoLabel}>Product</Text>
                  <Text style={s.infoValue}>Group Savings — Monthly Contributions</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── Banking details ───────────────────────── */}
          {banking && (
            <View style={s.bankingBox}>
              <View style={s.infoBoxHeader}>
                <Text style={s.infoBoxTitle}>Banking Details — Contribution Debit Account</Text>
              </View>
              <View style={s.bankingBody}>
                <View style={s.bankingCol}>
                  <Text style={s.bankingColLabel}>Bank</Text>
                  <Text style={s.bankingColValue}>{banking.bankName}</Text>
                </View>
                <View style={s.bankingCol}>
                  <Text style={s.bankingColLabel}>Account Number</Text>
                  <Text style={s.bankingColValue}>{banking.accountNumberMasked}</Text>
                </View>
                <View style={s.bankingCol}>
                  <Text style={s.bankingColLabel}>Account Type</Text>
                  <Text style={s.bankingColValue}>{banking.accountType}</Text>
                </View>
                <View style={s.bankingCol}>
                  <Text style={s.bankingColLabel}>Branch Code</Text>
                  <Text style={s.bankingColValue}>{banking.branchCode}</Text>
                </View>
                <View style={s.bankingCol}>
                  <Text style={s.bankingColLabel}>Status</Text>
                  <Text style={[s.bankingColValue, banking.verified ? s.sPaid : s.sOverdue]}>
                    {banking.verified ? 'Verified' : 'Unverified'}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Financial summary cards ───────────────── */}
          <View style={s.summaryRow}>
            <View style={[s.summaryCard, s.summaryCardGreen]}>
              <Text style={s.summaryCardLabel}>Total Due</Text>
              <Text style={s.summaryCardValue}>{rands(summary.totalDue)}</Text>
              <Text style={s.summaryCardSub}>this period</Text>
            </View>
            <View style={[s.summaryCard, s.summaryCardGreen]}>
              <Text style={s.summaryCardLabel}>Total Paid</Text>
              <Text style={s.summaryCardValue}>{rands(summary.totalPaid)}</Text>
              <Text style={s.summaryCardSub}>received</Text>
            </View>
            <View style={[s.summaryCard, fullyPaid ? s.summaryCardGreen : s.summaryCardRed]}>
              <Text style={s.summaryCardLabel}>Outstanding</Text>
              <Text style={[s.summaryCardValue, fullyPaid ? {} : s.summaryCardValueRed]}>
                {rands(summary.outstanding)}
              </Text>
              <Text style={s.summaryCardSub}>{fullyPaid ? 'fully settled' : 'balance due'}</Text>
            </View>
            <View style={[s.summaryCard, fullyPaid ? s.summaryCardGold : s.summaryCardAmber]}>
              <Text style={s.summaryCardLabel}>Period Status</Text>
              <Text style={[s.summaryCardValue, fullyPaid ? s.summaryCardValueGold : s.summaryCardValueAmber]}>
                {fullyPaid ? 'PAID' : 'OPEN'}
              </Text>
              <Text style={s.summaryCardSub}>{period.label}</Text>
            </View>
          </View>

          {/* ── Contributions table ───────────────────── */}
          <Text style={s.sectionHeading}>Contributions</Text>
          <View style={s.table}>
            <View style={s.tableHead}>
              <Text style={[s.tableHeadCell, s.cPeriod]}>Period</Text>
              <Text style={[s.tableHeadCell, s.cDue]}>Due</Text>
              <Text style={[s.tableHeadCell, s.cPaid]}>Paid</Text>
              <Text style={[s.tableHeadCell, s.cBalance]}>Outstanding</Text>
              <Text style={[s.tableHeadCell, s.cStatus]}>Status</Text>
              <Text style={[s.tableHeadCell, s.cDate]}>Due Date</Text>
            </View>
            {contributions.length === 0 ? (
              <View style={s.tableEmpty}>
                <Text style={s.tableEmptyText}>No contributions recorded for this period.</Text>
              </View>
            ) : contributions.map((c, i) => {
              const bal = Math.max(0, c.amountDue - c.amountPaid)
              return (
                <View key={c.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                  <Text style={[s.tableCell, s.cPeriod]}>{c.periodLabel}</Text>
                  <Text style={[s.tableCell, s.cDue]}>{rands(c.amountDue)}</Text>
                  <Text style={[s.tableCell, s.cPaid]}>{rands(c.amountPaid)}</Text>
                  <Text style={[s.tableCell, s.cBalance, bal > 0 ? s.sOverdue : s.sPaid]}>
                    {rands(bal)}
                  </Text>
                  <Text style={[s.tableCell, s.cStatus, statusStyle(c.status)]}>
                    {c.status}
                  </Text>
                  <Text style={[s.tableCell, s.cDate]}>{c.dueDate}</Text>
                </View>
              )
            })}
          </View>

          {/* ── Transactions table ────────────────────── */}
          <Text style={s.sectionHeading}>Transaction History</Text>
          <View style={s.table}>
            <View style={s.tableHead}>
              <Text style={[s.tableHeadCell, s.tDate]}>Date</Text>
              <Text style={[s.tableHeadCell, s.tDesc]}>Description</Text>
              <Text style={[s.tableHeadCell, s.tRef]}>Reference</Text>
              <Text style={[s.tableHeadCell, s.tAmount]}>Amount</Text>
              <Text style={[s.tableHeadCell, s.tStatus]}>Status</Text>
              <Text style={[s.tableHeadCell, s.tProc]}>Processed</Text>
            </View>
            {transactions.length === 0 ? (
              <View style={s.tableEmpty}>
                <Text style={s.tableEmptyText}>No transactions recorded for this period.</Text>
              </View>
            ) : transactions.map((t, i) => (
              <View key={t.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
                <Text style={[s.tableCell, s.tDate]}>{t.createdAt}</Text>
                <Text style={[s.tableCell, s.tDesc]}>{txDescription(t.type)}</Text>
                <Text style={[s.tableCellMuted, s.tRef]}>{t.gatewayRef ?? '—'}</Text>
                <Text style={[s.tableCell, s.tAmount, statusStyle(t.status)]}>{rands(t.amount)}</Text>
                <Text style={[s.tableCell, s.tStatus, statusStyle(t.status)]}>{t.status}</Text>
                <Text style={[s.tableCellMuted, s.tProc]}>{t.processedAt ?? '—'}</Text>
              </View>
            ))}
          </View>

          {/* ── Disclaimer ────────────────────────────── */}
          <View style={s.disclaimer}>
            <Text style={s.disclaimerText}>
              This statement is a record of your contributions and transactions for the specified period on the Xkimm Xa Mali private group savings platform.
              It is intended solely for the named account holder. If you believe this statement is incorrect, please contact your group administrator immediately.
              Amounts are in South African Rand (ZAR). This document was generated electronically and authorised with the administrator&rsquo;s signature below.
            </Text>
          </View>

          {/* ── Authorisation / signature ─────────────── */}
          <View style={s.signatureBlock}>
            <Text style={s.signatureLabel}>Authorised by</Text>
            {signature ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image, not an HTML img */}
                <Image src={signature.imageDataUri} style={s.signatureImage} />
                <Text style={s.signatureName}>{signature.displayName}</Text>
              </>
            ) : (
              <Text style={s.signatureName}>Xkimm Xa Mali Administration</Text>
            )}
            <Text style={s.signatureDate}>Generated: {generatedAt}</Text>
            <Text style={s.verificationText}>Xkimm Xa Mali — Official Document</Text>
          </View>

        </View>

        {/* ── Fixed footer (every page) ─────────────── */}
        <View style={s.footer} fixed>
          <View style={s.footerLeft}>
            <Text style={s.footerBold}>Xkimm Xa Mali</Text>
            <Text style={s.footerText}>Private Group Savings Platform · South Africa</Text>
          </View>
          <View style={s.footerCenter}>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            } />
            <Text style={s.footerGold}>&ldquo;Blessed is the hand that giveth.&rdquo;</Text>
          </View>
          <View style={s.footerRight}>
            <Text style={s.footerText}>Generated: {generatedAt}</Text>
            <Text style={s.footerText}>Ref: {docRef}</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function renderStatementPDF(data: StatementData): Promise<Buffer> {
  return renderToBuffer(<StatementDocument data={data} />)
}
