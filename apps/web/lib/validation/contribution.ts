import { z } from 'zod'

export const ManualContributionSchema = z.object({
  amount: z.number().min(100, 'Minimum contribution is R100'),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2024),
})

export const CreateBankAccountSchema = z.object({
  bankName: z.string().min(1, 'Bank name is required'),
  accountNumber: z.string().min(6, 'Account number is required').max(20),
  accountType: z.enum(['SAVINGS', 'CHEQUE', 'TRANSMISSION']),
  branchCode: z.string().length(6, 'Branch code must be 6 digits'),
})

export type ManualContributionInput = z.infer<typeof ManualContributionSchema>
export type CreateBankAccountInput = z.infer<typeof CreateBankAccountSchema>
