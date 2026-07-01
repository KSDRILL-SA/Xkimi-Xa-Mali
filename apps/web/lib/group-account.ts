// ─── Group settlement account ──────────────────────────────────────────────────
// Where Netcash deposits the contributions it collects from members. This is the
// group's own bank account, nominated on the Netcash merchant profile. Shown for
// transparency on the payment surfaces. Override per-environment via NEXT_PUBLIC_*.

export const GROUP_ACCOUNT = {
  accountName:   process.env.NEXT_PUBLIC_GROUP_ACCOUNT_NAME ?? 'Xkimm Xa Mali Foundation',
  bankName:      process.env.NEXT_PUBLIC_GROUP_BANK_NAME    ?? 'ABSA Bank',
  accountNumber: process.env.NEXT_PUBLIC_GROUP_BANK_ACCOUNT ?? '9385143164',
  branchCode:    process.env.NEXT_PUBLIC_GROUP_BANK_BRANCH  ?? '632005',
} as const

// Netcash processing fee buffer, in Rand. Added to the amount DEBITED from the
// member (not to the contribution itself) so that after Netcash deducts its fee
// the group still nets the full contribution. Set to 0 to disable. Used for both
// the on-screen note and the actual debit amount, so they always agree.
export const NETCASH_FEE_BUFFER = Math.max(0, Number(process.env.NEXT_PUBLIC_NETCASH_FEE_BUFFER ?? '10'))

/**
 * The amount to debit from a member to net `contributionAmount` after Netcash's
 * fee. The contribution record stays `contributionAmount`; only the debit
 * instruction carries the extra buffer.
 */
export function debitAmountWithFee(contributionAmount: number): number {
  return Math.round((contributionAmount + NETCASH_FEE_BUFFER) * 100) / 100
}
