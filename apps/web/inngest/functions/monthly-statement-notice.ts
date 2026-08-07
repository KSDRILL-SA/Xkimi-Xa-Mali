import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { logger } from '@xxm/observability'
import { createInboxMessages } from '@/services/inbox.service'
import { queueNotification } from '@/services/notification.service'
import { env } from '@/lib/env'

/**
 * Monthly: tell every active member their statement is ready.
 *
 * It used to write straight into `inboxMessage` and stop there. The guide
 * offers four ways to hear from the Foundation — "SMS, email, WhatsApp and
 * in-app messages. You choose which channels you want" — and lists a ready
 * statement among the things you are told. A member who had chosen SMS or email
 * was never told at all; the message sat in an inbox they had no reason to open.
 *
 * Going through `queueNotification` puts this back under the member's own
 * choice. These slugs are deliberately not in `MANDATORY_SLUGS`: a statement
 * being ready is an invitation to look, not money moving, so a member who has
 * switched a channel off should not be overridden. The in-app copy is written
 * unconditionally, which is the one channel nobody opts out of.
 */
export type StatementNoticeStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

const BATCH = 50

export async function executeMonthlyStatementNotice(step: StatementNoticeStepRunner) {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const label = prev.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

  const members = await step.run('fetch-active-members', () =>
    db.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true, firstName: true } }),
  )

  if (members.length === 0) return { notified: 0, queued: 0, period: label }

  await step.run('write-inbox', () =>
    createInboxMessages(
      members.map((m) => m.id),
      {
        title: `Your ${label} statement is ready`,
        body: `Your contribution statement for ${label} is ready to download from the Statements page.`,
        category: 'SYSTEM',
      },
    ),
  )

  const url = `${env.NEXTAUTH_URL ?? ''}/dashboard/statements`

  // Batched so a fifty-member circle is a handful of steps rather than a
  // hundred, and so one member's queue write cannot strand the rest.
  let queued = 0
  for (let i = 0; i < members.length; i += BATCH) {
    const batch = members.slice(i, i + BATCH)

    await step.run(`queue-${i}`, async () => {
      for (const member of batch) {
        const payload = { firstName: member.firstName ?? '', period: label, url }
        await queueNotification({
          userId: member.id, templateSlug: 'statement-ready-sms',
          channel: 'SMS', payload,
        })
        await queueNotification({
          userId: member.id, templateSlug: 'statement-ready-email',
          channel: 'EMAIL', payload,
        })
      }
    })

    // Outside the step: a completed step is not re-executed on re-entry, so a
    // total accumulated inside one comes back as zero on the pass that returns.
    queued += batch.length * 2
  }

  logger.info('Monthly statement notices sent', {
    period: label, notified: members.length, queued,
  })

  return { notified: members.length, queued, period: label }
}

export const monthlyStatementNotice = inngest.createFunction(
  { id: 'monthly-statement-notice', name: 'Monthly Statement Notice' },
  { cron: '0 4 3 * *' }, // 3rd of each month, 06:00 SAST — after month-end debits settle
  ({ step }) => executeMonthlyStatementNotice(step as unknown as StatementNoticeStepRunner),
)
