import { z } from 'zod'

export const ManualContributionSchema = z.object({
  amount: z.number().min(100, 'Minimum contribution is R100'),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2024),
})

export const GenerateContributionsSchema = z.object({
  month: z.number().int().min(1, 'Month must be 1–12').max(12, 'Month must be 1–12'),
  year: z.number().int().min(2024, 'Year must be 2024 or later'),
})

export type ManualContributionInput = z.infer<typeof ManualContributionSchema>
export type GenerateContributionsInput = z.infer<typeof GenerateContributionsSchema>
