import { isLiveDeployment } from '@xxm/utils'
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
 * the money path can be walked end to end in development, in tests, and on a
 * staging deploy that has no Netcash credentials yet, without charging anybody.
 *
 * The live check is deliberately a thrown error at module load, not a warning
 * and not a silent fall-back to Netcash. A mock gateway running in production
 * would report every debit as collected while no money moved: contributions
 * marked paid, a pool balance that does not exist, and the members finding out
 * at the worst possible moment. Refusing to start is the only safe answer, and
 * it fails on deploy rather than on debit night.
 */
function selectGateway(): IPaymentGateway {
  if (process.env.PAYMENT_GATEWAY !== 'mock') {
    // `lib/env.ts` only requires NETCASH_SERVICE_KEY when `isLiveDeployment()`
    // is also true — but this selection does not check that at all. A deploy
    // with DEPLOY_ENV left at "staging" while genuinely serving real traffic
    // (the exact state this project's production deployment was actually in)
    // would select the real gateway here with nothing configured, and env.ts
    // would not have caught it either, because it never considered the
    // deployment live. The first anyone would hear of it is a throw inside
    // `lib/netcash.ts` on an actual debit submission — on debit night, which
    // is precisely the failure mode this file exists to convert into a
    // refusal to start.
    if (!process.env.NETCASH_SERVICE_KEY) {
      throw new Error(
        'PAYMENT_GATEWAY is not "mock", so the real Netcash gateway was selected, ' +
        'but NETCASH_SERVICE_KEY is not set — every debit submission would throw. ' +
        'Set NETCASH_SERVICE_KEY (and NETCASH_WEBHOOK_SECRET) before deploying, ' +
        'or set PAYMENT_GATEWAY=mock to run against the stand-in instead.',
      )
    }
    return netcashGateway
  }

  if (isLiveDeployment()) {
    throw new Error(
      'PAYMENT_GATEWAY=mock is set in a production deployment. The mock gateway ' +
      'moves no money and would report uncollected debits as settled. Refusing to start.',
    )
  }

  return mockGateway
}

export const paymentGateway: IPaymentGateway = selectGateway()

/** Whether the app is running against the stand-in rather than the real thing. */
export const IS_MOCK_GATEWAY = paymentGateway === mockGateway
