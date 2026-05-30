import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

/**
 * Nightly job to mark PENDING invitations whose expiresAt has passed as EXPIRED.
 * Without this, the invitation table accumulates stale PENDING rows and the
 * duplicate-check in generateInvite would block re-inviting the same contact.
 */
export const inviteExpiry = inngest.createFunction(
  { id: 'invite-expiry', name: 'Invitation Expiry Sweep' },
  { cron: '0 1 * * *' }, // 03:00 SAST (UTC+2) — after goal-deadline-checker
  async ({ step }) => {
    const result = await step.run('expire-invitations', () =>
      db.invitation.updateMany({
        where: {
          status: 'PENDING',
          expiresAt: { lt: new Date() },
        },
        data: { status: 'EXPIRED' },
      }),
    )

    logger.info('Invitation expiry sweep completed', { expired: result.count })
    return { expired: result.count }
  },
)
