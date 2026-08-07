import {
  sendSMS,
  sendBulkSMS,
  getSMSStatus,
  verifyBulkSmsWebhook,
  normalisePhone,
} from '@/lib/bulksms'
import type { ISmsProvider, SendSMSInput } from './types'

export const bulksmsProvider: ISmsProvider = {
  send: (input: SendSMSInput) => sendSMS(input),
  sendBulk: (messages: SendSMSInput[]) => sendBulkSMS(messages),
  getStatus: (messageId: string) => getSMSStatus(messageId),
  verifyWebhook: (body: string, signature: string, secret: string) =>
    verifyBulkSmsWebhook(body, signature, secret),
  normalisePhone: (phone: string) => normalisePhone(phone),
}
