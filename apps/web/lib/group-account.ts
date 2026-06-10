// ─── Group settlement account ──────────────────────────────────────────────────
// Where Netcash deposits the contributions it collects from members. This is the
// group's own bank account, nominated on the Netcash merchant profile. Shown for
// transparency on the payment surfaces. Override per-environment via NEXT_PUBLIC_*.

export const GROUP_ACCOUNT = {
  accountName:   process.env.NEXT_PUBLIC_GROUP_ACCOUNT_NAME ?? 'Xkimm Xa Mali',
  bankName:      process.env.NEXT_PUBLIC_GROUP_BANK_NAME    ?? 'ABSA Bank',
  accountNumber: process.env.NEXT_PUBLIC_GROUP_BANK_ACCOUNT ?? '9385143164',
  branchCode:    process.env.NEXT_PUBLIC_GROUP_BANK_BRANCH  ?? '632005',
} as const

// Indicative Netcash processing fee charged per debit, in Rand. Budget this on
// top of a contribution so the group nets the full amount. Set to 0 to hide.
export const NETCASH_FEE_BUFFER = Number(process.env.NEXT_PUBLIC_NETCASH_FEE_BUFFER ?? '10')
