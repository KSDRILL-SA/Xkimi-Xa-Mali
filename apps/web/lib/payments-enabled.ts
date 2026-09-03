import { env } from '@/lib/env'
import { GATEWAY_CAN_MOVE_MONEY } from '@/integrations/payment'

/**
 * Whether a member may submit a payment from inside the app.
 *
 * Two conditions, and the second is the one that was missing:
 *
 *   1. `ENABLE_MANUAL_PAYMENTS` — leadership's intention. A deliberate switch
 *      for turning the feature off while everything else keeps working.
 *   2. the gateway can actually move money — reality.
 *
 * Only the first existed, and a person's intention is not a safety property. It
 * cannot be relied on to change at the same moment a gateway does, and it did
 * not: production ran the mock gateway with this flag left on, so the payment
 * form stayed open and every submission answered SUCCESS. A member paid R100,
 * a settled transaction was written, the pool was credited and the contribution
 * was marked paid, and no bank had been contacted.
 *
 * The second condition is derived from which adapter was selected rather than
 * declared anywhere, so it cannot drift out of step with the thing it describes.
 * Nobody has to remember to set it.
 *
 * This does not touch the offline path. Cash and EFT recorded through the admin
 * console never go near a gateway, which is exactly why they still work — and
 * why switching this off leaves the Foundation able to collect money rather
 * than stranded.
 */
export const MEMBER_PAYMENTS_ENABLED = env.ENABLE_MANUAL_PAYMENTS && GATEWAY_CAN_MOVE_MONEY

/**
 * What to tell a member when the form is not there.
 *
 * Said plainly, and it names the way that does work. A payment page that simply
 * vanishes reads as the app being broken; this reads as an arrangement, which
 * is what it is.
 */
export const PAYMENTS_DISABLED_MESSAGE = GATEWAY_CAN_MOVE_MONEY
  ? 'Payments are temporarily switched off. Please try again later.'
  : 'The Foundation has no card or debit-order provider at the moment, so payments cannot be made in the app. ' +
    'Pay by EFT or in cash, send your proof of payment to the group, and leadership will record it against your month.'
