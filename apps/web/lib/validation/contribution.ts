import { z } from 'zod'

export const ManualContributionSchema = z.object({
  amount: z.number().min(100, 'Minimum contribution is R100'),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2024),
})

export type ManualContributionInput = z.infer<typeof ManualContributionSchema>

// Bank account schemas live in ./profile (member-owned banking data).
