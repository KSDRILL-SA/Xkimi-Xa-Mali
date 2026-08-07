import type { TransactionStatus } from '@prisma/client'

/**
 * What the gateway said, as a transaction status.
 *
 * The gateway distinguishes three outcomes and so must we. SUCCESS is
 * collected. PENDING is submitted and awaiting a settlement webhook. FAILED is
 * a decline.
 *
 * Both jobs that submit a debit got this wrong in the same way, writing every
 * non-success as PENDING. In the debit run that hid declines from the retry
 * job and told the member their debit was processing. In the retry job it was
 * worse: PENDING is not in the `status: 'FAILED'` set that job queries, so a
 * declined retry left the recovery pool permanently after one attempt.
 *
 * It lives here rather than in either job because getting it wrong twice, the
 * same way, is what it costs to have two copies.
 */
export function toTransactionStatus(gatewayStatus: 'SUCCESS' | 'PENDING' | 'FAILED'): TransactionStatus {
  if (gatewayStatus === 'SUCCESS') return 'SUCCESS'
  if (gatewayStatus === 'FAILED') return 'FAILED'
  return 'PENDING'
}
