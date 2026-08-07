export type AccountType = 'Cheque' | 'Savings' | 'Transmission'

export type MandateStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'REJECTED'

export type CreateMandatePayload = {
  accountNumber: string
  branchCode: string
  accountType: AccountType
  accountName: string
  idNumber?: string
  amount: number
  debitDay: number
  startDate: string
  referenceNumber: string
}

export type MandateResponse = {
  mandateId: string
  status: MandateStatus
  message?: string
  errorCode?: string
}

export type MandateStatusResponse = {
  mandateId: string
  status: MandateStatus
  lastDebitDate?: string
  nextDebitDate?: string
}

export type WebhookEvent = {
  mandateId: string
  status: MandateStatus
  reason?: string
  transactionRef?: string
  amount?: number
  processedAt?: string
}

export type TransactionEvent = {
  transactionRef: string
  status: 'SUCCESS' | 'FAILED' | 'REVERSED' | 'PENDING'
  mandateId?: string
  amount?: number
  reason?: string
  processedAt?: string
}

export type DebitPayload = {
  mandateId: string
  amount: number
  reference: string
  idempotencyKey: string
}

export type DebitResponse = {
  transactionRef?: string
  status: 'SUCCESS' | 'PENDING' | 'FAILED'
  message?: string
  reason?: string
  errorCode?: string
}

export type MandateUpdateChanges = {
  amount?: number
  debitDay?: number
}

export interface IPaymentGateway {
  createMandate(payload: CreateMandatePayload): Promise<MandateResponse>
  cancelMandate(mandateId: string): Promise<MandateResponse>
  updateMandate(mandateId: string, changes: MandateUpdateChanges, effectiveDate: string): Promise<MandateResponse>
  delayMandate(mandateId: string, newDate: string): Promise<MandateResponse>
  getMandateStatus(mandateId: string): Promise<MandateStatusResponse>
  submitOnceOffDebit(payload: DebitPayload): Promise<DebitResponse>
  submitScheduledDebit(payload: DebitPayload): Promise<DebitResponse>
  mapTransactionStatus(raw: string): 'SUCCESS' | 'FAILED' | 'REVERSED' | null
  /** Null when the status is not recognised — see `mapNetcashStatus`. */
  mapMandateStatus(raw: string): 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | null
  verifyWebhookSignature(rawBody: string, signatureHeader: string): boolean
  isAllowedWebhookIp(ip: string): boolean
  getNextDebitDate(debitDay: number): string
}
