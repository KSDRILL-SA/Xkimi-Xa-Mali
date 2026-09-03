import { isLiveDeployment } from '@xxm/utils'
import type { IPaymentGateway } from './types'
import { netcashGateway } from './netcash.adapter'
import { mockGateway } from './mock.adapter'
import { disabledGateway } from './disabled.adapter'

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
 * Three, not two, and the third is the one this system is actually in:
 *
 *   - **Netcash**, the real thing, whenever it is configured.
 *   - **the mock**, for development and tests, so the money path can be walked
 *     end to end without charging anybody. Never on a live deployment.
 *   - **disabled**, when a live deployment has no way to move money. Every
 *     money operation refuses, and the member-facing payment paths switch
 *     themselves off.
 *
 * ── What went wrong with two ───────────────────────────────────────────────
 *
 * The mock was refused on a live deployment by a throw at module load, which
 * was the right instinct and the wrong mechanism, because it depended on the
 * app knowing it was live — and it did not. `isLiveDeployment()` short-circuited
 * on a hand-set DEPLOY_ENV, production had one set to a non-live value, so the
 * guard never fired. The stand-in was selected in production and answered
 * SUCCESS to every debit. A member paid R100 in the app; a settled transaction
 * was written, the pool credited, the contribution marked paid, and no bank was
 * ever contacted.
 *
 * `isLiveDeployment` is fixed at the root — the platform's VERCEL_ENV now
 * outranks any declaration. This file no longer relies on that alone.
 *
 * ── Why refusing beats throwing ────────────────────────────────────────────
 *
 * With that fixed, a live deployment holding PAYMENT_GATEWAY=mock and no
 * Netcash credentials would refuse to start — and that is this Foundation's
 * actual configuration, because the DebiCheck application was declined and
 * there are no credentials to be had. Refusing to start would take down
 * statements, invitations, the community board and the admin console along
 * with it, for the sake of a feature deliberately not in use.
 *
 * So a live deployment with no real gateway gets `disabledGateway`: present,
 * honest, and refusing. The app runs, members see everything except a payment
 * form that could not work, and money is recorded the way it is actually
 * received — in cash or by EFT, through the admin console.
 *
 * A misconfigured NON-live deployment still throws. There it is a developer's
 * mistake with no members to protect, and failing loudly is the fastest way to
 * hear about it.
 */
function selectGateway(): IPaymentGateway {
  const live = isLiveDeployment()
  const wantsMock = process.env.PAYMENT_GATEWAY === 'mock'
  const hasNetcash = Boolean(process.env.NETCASH_SERVICE_KEY)

  if (!wantsMock && hasNetcash) return netcashGateway

  if (live) {
    // Nothing on a live deployment may report money as moved unless it moved.
    // Not the mock, and not a real adapter with no credentials behind it —
    // that one throws on submission instead, which is the same lie told later.
    console.error(
      '[payments] No usable payment gateway on a live deployment. ' +
      `PAYMENT_GATEWAY=${process.env.PAYMENT_GATEWAY ?? '(unset)'}, ` +
      `NETCASH_SERVICE_KEY ${hasNetcash ? 'is set' : 'is NOT set'}. ` +
      'Member payments are switched off; nothing will be recorded as collected. ' +
      'Offline payments recorded through the admin console are unaffected.',
    )
    return disabledGateway
  }

  if (!wantsMock) {
    throw new Error(
      'PAYMENT_GATEWAY is not "mock", so the real Netcash gateway was selected, ' +
      'but NETCASH_SERVICE_KEY is not set — every debit submission would throw. ' +
      'Set NETCASH_SERVICE_KEY (and NETCASH_WEBHOOK_SECRET), ' +
      'or set PAYMENT_GATEWAY=mock to run against the stand-in instead.',
    )
  }

  return mockGateway
}

export const paymentGateway: IPaymentGateway = selectGateway()

/** Whether the app is running against the stand-in rather than the real thing. */
export const IS_MOCK_GATEWAY = paymentGateway === mockGateway

/**
 * Whether a payment submitted through this gateway would move real money.
 *
 * The switch the member-facing payment paths hang off, and the reason it is
 * derived rather than declared: `ENABLE_MANUAL_PAYMENTS` is a person's
 * intention, and a person cannot be relied on to turn it off at the same moment
 * a gateway stops working. This cannot disagree with reality — it is read from
 * which adapter was selected.
 *
 * False only for the disabled gateway. The mock stays "enabled" on purpose:
 * walking the payment path end to end is the entire reason it exists, and it
 * can no longer reach a live deployment — `selectGateway` above returns the
 * disabled adapter there instead, so the only places the mock can run are the
 * ones with no real members to mislead.
 */
export const GATEWAY_CAN_MOVE_MONEY = paymentGateway !== disabledGateway

export { PaymentsUnavailableError } from './disabled.adapter'
