import type {
  IPaymentGateway,
  CreateMandatePayload,
  MandateResponse,
  MandateStatusResponse,
  MandateUpdateChanges,
  DebitPayload,
  DebitResponse,
} from './types'

/**
 * The honest third state: a live deployment with no way to move money.
 *
 * There were two adapters and they covered two situations — a real gateway, or
 * a stand-in for development. The situation this system is actually in was
 * neither. Netcash declined the DebiCheck application, so there are no
 * credentials and there will not be any; but the app still has to run, because
 * everything except collecting money still works and members depend on it.
 *
 * Faced with that, the previous code had only two answers and both were wrong:
 *
 *   - select the mock, which reports SUCCESS for every debit and writes settled
 *     transactions for money that never moved. This is what actually happened.
 *     A member paid R100 in the app, the pool was credited, the contribution
 *     was marked paid, and no bank was ever contacted.
 *   - throw at boot, which takes down statements, invitations, the community
 *     board and the admin console along with the payment path — for a feature
 *     that is deliberately not in use.
 *
 * So there is a third: a gateway that is present, honest, and refuses. Every
 * money operation throws a clear domain error rather than inventing a result,
 * and `GATEWAY_CAN_MOVE_MONEY` is false so the member-facing payment paths
 * switch themselves off rather than offering a form that cannot work.
 *
 * Nothing here is a fallback that might quietly become the live path. It is the
 * live path, for a Foundation that currently collects money in cash and by EFT
 * and records it through the admin console instead.
 */

/** What every refusal says. One sentence, in the words a member would need. */
const REFUSAL =
  'Card and debit-order payments are not available. The Foundation has no active ' +
  'payment provider, so payments are made by EFT or cash and recorded by leadership.'

export class PaymentsUnavailableError extends Error {
  readonly code = 'PAY_DISABLED'
  constructor(operation: string) {
    super(`${REFUSAL} (attempted: ${operation})`)
    this.name = 'PaymentsUnavailableError'
  }
}

const refuse = (operation: string): never => {
  throw new PaymentsUnavailableError(operation)
}

export const disabledGateway: IPaymentGateway = {
  async createMandate(_payload: CreateMandatePayload): Promise<MandateResponse> {
    return refuse('create mandate')
  },

  async cancelMandate(_mandateId: string): Promise<MandateResponse> {
    return refuse('cancel mandate')
  },

  async updateMandate(
    _mandateId: string, _changes: MandateUpdateChanges, _effectiveDate: string,
  ): Promise<MandateResponse> {
    return refuse('update mandate')
  },

  async delayMandate(_mandateId: string, _newDate: string): Promise<MandateResponse> {
    return refuse('delay mandate')
  },

  async getMandateStatus(_mandateId: string): Promise<MandateStatusResponse> {
    return refuse('read mandate status')
  },

  async submitOnceOffDebit(_payload: DebitPayload): Promise<DebitResponse> {
    return refuse('once-off debit')
  },

  async submitScheduledDebit(_payload: DebitPayload): Promise<DebitResponse> {
    return refuse('scheduled debit')
  },

  /**
   * Null, never a status. These map a provider's word for an outcome onto ours,
   * and no provider is speaking — so there is no outcome to map, and answering
   * anything would be inventing one.
   */
  mapTransactionStatus() {
    return null
  },

  mapMandateStatus() {
    return null
  },

  /**
   * False, like the mock's. No provider is sending callbacks, so any request
   * claiming to be one is either a mistake or an attempt, and both are refused
   * by the same answer.
   */
  verifyWebhookSignature(): boolean {
    return false
  },

  isAllowedWebhookIp(): boolean {
    return false
  },

  /**
   * The one thing it will still answer. This is a calendar calculation with no
   * provider in it, and the debit-day arithmetic is used to display when a
   * period falls due — which stays true whether or not anything collects it.
   */
  getNextDebitDate(debitDay: number): string {
    const now = new Date()
    const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), debitDay))
    if (candidate <= now) candidate.setUTCMonth(candidate.getUTCMonth() + 1)
    return candidate.toISOString().slice(0, 10)
  },
}
