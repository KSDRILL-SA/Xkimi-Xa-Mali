import type { IPaymentGateway } from './types'
import { netcashGateway } from './netcash.adapter'
import { mockGateway } from './mock.adapter'

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

/**
 * Which gateway the app talks to.
 *
 * Netcash, unless PAYMENT_GATEWAY is explicitly set to "mock" — which exists so
 * the money path can be walked end to end in development and in tests without
 * charging anybody.
 *
 * The production check is deliberately a thrown error at module load, not a
 * warning and not a silent fall-back to Netcash. A mock gateway running in
 * production would report every debit as collected while no money moved:
 * contributions marked paid, a pool balance that does not exist, and the members
 * finding out at the worst possible moment. Refusing to start is the only safe
 * answer, and it fails on deploy rather than on debit night.
 */
function selectGateway(): IPaymentGateway {
  if (process.env.PAYMENT_GATEWAY !== 'mock') return netcashGateway

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PAYMENT_GATEWAY=mock is set in a production build. The mock gateway moves ' +
      'no money and would report uncollected debits as settled. Refusing to start.',
    )
  }

  return mockGateway
}

export const paymentGateway: IPaymentGateway = selectGateway()

/** Whether the app is running against the stand-in rather than the real thing. */
export const IS_MOCK_GATEWAY = paymentGateway === mockGateway
