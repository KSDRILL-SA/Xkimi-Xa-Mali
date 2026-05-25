import { z } from 'zod'

export const CreateMandateSchema = z.object({
  bankAccountId: z.string().cuid('Invalid bank account'),
  debitDay: z
    .number()
    .int()
    .min(1, 'Debit day must be between 1 and 28')
    .max(28, 'Debit day must be between 1 and 28'),
  amount: z.number().min(100, 'Minimum contribution is R100'),
})

export const UpdateMandateSchema = z.object({
  debitDay: z.number().int().min(1).max(28).optional(),
  amount: z.number().min(100).optional(),
})

export const DelayMandateSchema = z.object({
  newDate: z.string().date('Please provide a valid date (YYYY-MM-DD)'),
  reason: z.string().max(200).optional(),
})

export type CreateMandateInput = z.infer<typeof CreateMandateSchema>
export type DelayMandateInput = z.infer<typeof DelayMandateSchema>
