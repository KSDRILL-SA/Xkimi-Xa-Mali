export type {
  IPaymentGateway,
  AccountType,
  MandateStatus,
  CreateMandatePayload,
  MandateResponse,
  MandateStatusResponse,
  MandateUpdateChanges,
  WebhookEvent,
  TransactionEvent,
  DebitPayload,
  DebitResponse,
} from './types'

export { netcashGateway as paymentGateway } from './netcash.adapter'
