export type DeliveryStatus =
  | 'ACCEPTED'
  | 'SCHEDULED'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'UNKNOWN'

export type SendSMSInput = {
  to: string
  body: string
  userSuppliedId?: string
}

export type SMSResult = {
  id: string
  status: { type: DeliveryStatus }
}

export type DeliveryReceipt = {
  id: string
  status: { type: DeliveryStatus }
  userSuppliedId?: string
  to: { address: string }
}

export interface ISmsProvider {
  send(input: SendSMSInput): Promise<SMSResult[]>
  sendBulk(messages: SendSMSInput[]): Promise<SMSResult[]>
  getStatus(messageId: string): Promise<SMSResult>
  verifyWebhook(body: string, signature: string, secret: string): boolean
  normalisePhone(phone: string): string
}
