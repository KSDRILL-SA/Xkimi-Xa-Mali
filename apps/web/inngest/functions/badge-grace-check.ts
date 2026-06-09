import { inngest } from '@/lib/inngest'
import { checkGraceExpiry } from '@/services/badge.service'

export const badgeGraceCheck = inngest.createFunction(
  { id: 'badge-grace-check', name: 'Badge Grace Period Check' },
  { cron: '0 3 * * *' }, // 05:00 SAST (UTC+2) daily
  async ({ step }) => {
    const demoted = await step.run('check-grace-expiry', () => checkGraceExpiry())
    return { demoted }
  },
)
