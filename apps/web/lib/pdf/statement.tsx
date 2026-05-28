import React from 'react'
import {
  Document,
  Page,
  View,
  Text,
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
  }
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
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const GREEN = '#1B4332'
const GOLD  = '#D4A017'
const GRAY  = '#6B7280'
const LIGHT = '#F9FAFB'
const RED   = '#DC2626'

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#111827',
    padding: 40,
    backgroundColor: '#FFFFFF',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: `2px solid ${GREEN}`,
  },
  logoText: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: GREEN },
  tagline: { fontSize: 8, color: GRAY, marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  statementTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: GREEN },
  periodLabel: { fontSize: 10, color: GRAY, marginTop: 2 },
  generatedAt: { fontSize: 7, color: GRAY, marginTop: 4 },
  // Member info
  memberSection: {
    backgroundColor: LIGHT,
    borderRadius: 4,
    padding: 12,
    marginBottom: 20,
  },
  memberLabel: { fontSize: 7, color: GRAY, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  memberName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: GREEN },
  memberDetail: { fontSize: 8, color: GRAY, marginTop: 2 },
  // Section heading
  sectionHeading: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: GREEN, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  // Table
  tableHeader: { flexDirection: 'row', backgroundColor: GREEN, borderRadius: 2, padding: '6 8', marginBottom: 1 },
  tableHeaderCell: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#FFFFFF' },
  tableRow: { flexDirection: 'row', padding: '5 8', borderBottom: `1px solid #E5E7EB` },
  tableRowAlt: { backgroundColor: LIGHT },
  tableCell: { fontSize: 8, color: '#374151' },
  // Summary
  summaryBox: { marginTop: 20, borderTop: `2px solid ${GREEN}`, paddingTop: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 9, color: GRAY },
  summaryValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: GREEN },
  summaryOutstanding: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: RED },
  summaryTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTop: `1px solid #E5E7EB`,
  },
  // Status badges
  statusPaid: { color: '#059669', fontFamily: 'Helvetica-Bold' },
  statusPending: { color: '#D97706' },
  statusFailed: { color: RED },
  statusDefault: { color: GRAY },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    borderTop: `1px solid #E5E7EB`,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: { fontSize: 7, color: GRAY },
  footerGold: { fontSize: 7, color: GOLD, fontFamily: 'Helvetica-BoldOblique' },
  // Column widths
  colPeriod: { width: '25%' },
  colDue: { width: '20%', textAlign: 'right' },
  colPaid: { width: '20%', textAlign: 'right' },
  colStatus: { width: '15%', textAlign: 'center' },
  colDate: { width: '20%', textAlign: 'right' },
  colAmount: { width: '20%', textAlign: 'right' },
  colType: { width: '20%' },
  colRef: { width: '30%' },
  colTxStatus: { width: '15%', textAlign: 'center' },
  colProcessed: { width: '15%', textAlign: 'right' },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatZAR(amount: number): string {
  return `R ${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

function statusStyle(status: string) {
  switch (status) {
    case 'PAID':    case 'SUCCESS':   return s.statusPaid
    case 'PENDING': case 'PROCESSING': return s.statusPending
    case 'FAILED':  case 'REVERSED':  return s.statusFailed
    default: return s.statusDefault
  }
}

// ─── Document ─────────────────────────────────────────────────────────────────

function StatementDocument({ data }: { data: StatementData }) {
  const { member, period, contributions, transactions, summary, generatedAt } = data

  return (
    <Document
      title={`Xkimm Xa Mali Statement — ${member.firstName} ${member.lastName} — ${period.label}`}
      author="Xkimm Xa Mali"
      subject="Member Contribution Statement"
    >
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.logoText}>Xkimm Xa Mali</Text>
            <Text style={s.tagline}>"Blessed is the hand that giveth."</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.statementTitle}>Statement</Text>
            <Text style={s.periodLabel}>{period.label}</Text>
            <Text style={s.generatedAt}>Generated: {generatedAt}</Text>
          </View>
        </View>

        {/* Member details */}
        <View style={s.memberSection}>
          <Text style={s.memberLabel}>Member</Text>
          <Text style={s.memberName}>{member.firstName} {member.lastName}</Text>
          <Text style={s.memberDetail}>{member.email}</Text>
          <Text style={s.memberDetail}>{member.phone}</Text>
        </View>

        {/* Contributions table */}
        <Text style={s.sectionHeading}>Contributions</Text>
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, s.colPeriod]}>Period</Text>
          <Text style={[s.tableHeaderCell, s.colDue]}>Due</Text>
          <Text style={[s.tableHeaderCell, s.colPaid]}>Paid</Text>
          <Text style={[s.tableHeaderCell, s.colStatus]}>Status</Text>
          <Text style={[s.tableHeaderCell, s.colDate]}>Due Date</Text>
        </View>
        {contributions.map((c, i) => (
          <View key={c.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
            <Text style={[s.tableCell, s.colPeriod]}>{c.periodLabel}</Text>
            <Text style={[s.tableCell, s.colDue]}>{formatZAR(c.amountDue)}</Text>
            <Text style={[s.tableCell, s.colPaid]}>{formatZAR(c.amountPaid)}</Text>
            <Text style={[s.tableCell, s.colStatus, statusStyle(c.status)]}>{c.status}</Text>
            <Text style={[s.tableCell, s.colDate]}>{c.dueDate}</Text>
          </View>
        ))}
        {contributions.length === 0 && (
          <View style={s.tableRow}>
            <Text style={[s.tableCell, { color: GRAY }]}>No contributions for this period.</Text>
          </View>
        )}

        {/* Transactions table */}
        <Text style={s.sectionHeading}>Transactions</Text>
        <View style={s.tableHeader}>
          <Text style={[s.tableHeaderCell, s.colAmount]}>Amount</Text>
          <Text style={[s.tableHeaderCell, s.colType]}>Type</Text>
          <Text style={[s.tableHeaderCell, s.colTxStatus]}>Status</Text>
          <Text style={[s.tableHeaderCell, s.colRef]}>Reference</Text>
          <Text style={[s.tableHeaderCell, s.colProcessed]}>Processed</Text>
        </View>
        {transactions.map((t, i) => (
          <View key={t.id} style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}>
            <Text style={[s.tableCell, s.colAmount]}>{formatZAR(t.amount)}</Text>
            <Text style={[s.tableCell, s.colType]}>{t.type.replace(/_/g, ' ')}</Text>
            <Text style={[s.tableCell, s.colTxStatus, statusStyle(t.status)]}>{t.status}</Text>
            <Text style={[s.tableCell, s.colRef]}>{t.gatewayRef ?? '—'}</Text>
            <Text style={[s.tableCell, s.colProcessed]}>{t.processedAt ?? '—'}</Text>
          </View>
        ))}
        {transactions.length === 0 && (
          <View style={s.tableRow}>
            <Text style={[s.tableCell, { color: GRAY }]}>No transactions for this period.</Text>
          </View>
        )}

        {/* Summary */}
        <View style={s.summaryBox}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total Due</Text>
            <Text style={s.summaryValue}>{formatZAR(summary.totalDue)}</Text>
          </View>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total Paid</Text>
            <Text style={s.summaryValue}>{formatZAR(summary.totalPaid)}</Text>
          </View>
          {summary.outstanding > 0 && (
            <View style={s.summaryTotal}>
              <Text style={[s.summaryLabel, { fontFamily: 'Helvetica-Bold', fontSize: 10 }]}>Outstanding</Text>
              <Text style={s.summaryOutstanding}>{formatZAR(summary.outstanding)}</Text>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Xkimm Xa Mali · Private Group Savings</Text>
          <Text style={s.footerGold}>"Blessed is the hand that giveth."</Text>
        </View>
      </Page>
    </Document>
  )
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function renderStatementPDF(data: StatementData): Promise<Buffer> {
  return renderToBuffer(<StatementDocument data={data} />)
}
