import {
  createDebiCheckMandate,
  cancelDebiCheckMandate,
  updateDebiCheckMandate,
  delayMandate as netcashDelayMandate,
  getMandateStatus,
  submitOnceOffDebit,
  submitScheduledDebit,
  mapNetcashTransactionStatus,
  mapNetcashStatus,
  verifyWebhookSignature,
  isAllowedNetcashIp,
  getNextDebitDate,
} from '@/lib/netcash'
import type { IPaymentGateway, CreateMandatePayload, MandateUpdateChanges, DebitPayload } from './types'

export const netcashGateway: IPaymentGateway = {
  createMandate: (payload: CreateMandatePayload) => createDebiCheckMandate(payload),
  cancelMandate: (mandateId: string) => cancelDebiCheckMandate(mandateId),
  updateMandate: (mandateId: string, changes: MandateUpdateChanges, effectiveDate: string) =>
    updateDebiCheckMandate(mandateId, changes, effectiveDate),
  delayMandate: (mandateId: string, newDate: string) => netcashDelayMandate(mandateId, newDate),
  getMandateStatus: (mandateId: string) => getMandateStatus(mandateId),
  submitOnceOffDebit: (payload: DebitPayload) => submitOnceOffDebit(payload),
  submitScheduledDebit: (payload: DebitPayload) => submitScheduledDebit(payload),
  mapTransactionStatus: (raw: string) => mapNetcashTransactionStatus(raw),
  mapMandateStatus: (raw: string) => mapNetcashStatus(raw),
  verifyWebhookSignature: (rawBody: string, signatureHeader: string) =>
    verifyWebhookSignature(rawBody, signatureHeader),
  isAllowedWebhookIp: (ip: string) => isAllowedNetcashIp(ip),
  getNextDebitDate: (debitDay: number) => getNextDebitDate(debitDay),
}
