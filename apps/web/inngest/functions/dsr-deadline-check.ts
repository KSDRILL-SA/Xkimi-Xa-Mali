import { inngest } from '@/lib/inngest'
import { surveyDsrDeadlines, WARN_WITHIN_DAYS } from '@/services/dsr-deadline.service'
import { raiseOperationalAlert } from '@/services/alert.service'
import { recordJobHeartbeat } from '@/lib/job-heartbeat'
import { logger } from '@xxm/observability'

/**
 * Watches the thirty days POPIA gives the Foundation to answer a data request.
 *
 * Weekly, not monthly: the period being watched is thirty days long, so a
 * monthly check could look once on day two and next on day thirty-two, and
 * report the breach it existed to prevent. Weekly means every open request is
 * seen at least four times before its deadline.
 *
 * Not daily either. Nothing here changes overnight, and a daily alert about the
 * same unanswered request for nine consecutive days is how an alert channel
 * becomes a thing people filter into a folder.
 *
 * Silent when there is nothing due. A weekly "0 requests" message would train
 * exactly the inattention this is meant to defeat.
 */
export const dsrDeadlineCheck = inngest.createFunction(
  { id: 'dsr-deadline-check', name: 'POPIA Request Deadline Check' },
  { cron: '0 6 * * 1' }, // 08:00 SAST (UTC+2), Mondays
  async ({ step }) => {
    const { breached, approaching } = await step.run('survey', () => surveyDsrDeadlines())

    if (breached.length === 0 && approaching.length === 0) {
      // Most weeks take this path — a fifty-person collective does not receive a
      // data request every week — so a heartbeat only on the reporting path
      // would read as a dead job almost all of the time.
      await step.run('heartbeat', () => recordJobHeartbeat('dsr-deadline-check'))
      logger.info('DSR deadline check: nothing due')
      return { breached: 0, approaching: 0 }
    }

    // A missed statutory deadline is a different thing from an approaching one,
    // and the difference decides how far the message travels. `critical` also
    // sends an SMS, which this service reserves for money not moving — a breach
    // is not that, but it is the one state the Foundation cannot fix by acting
    // sooner, because it has already happened.
    const severity = breached.length > 0 ? 'critical' : 'warning'

    const title =
      breached.length > 0
        ? `${breached.length} data request${breached.length === 1 ? '' : 's'} past the 30-day deadline`
        : `${approaching.length} data request${approaching.length === 1 ? '' : 's'} due within ${WARN_WITHIN_DAYS} days`

    const lines: string[] = []
    if (breached.length > 0) {
      lines.push('PAST THE STATUTORY DEADLINE:')
      for (const f of breached) {
        lines.push(`• ${f.kind} request — due ${f.dueOn}, ${Math.abs(f.daysLeft)} day${Math.abs(f.daysLeft) === 1 ? '' : 's'} ago (ref ${f.id})`)
      }
      lines.push('')
      lines.push('A late answer is still owed, and a record of why it was late is owed with it.')
      lines.push('')
    }
    if (approaching.length > 0) {
      lines.push('Due soon:')
      for (const f of approaching) {
        lines.push(`• ${f.kind} request — due ${f.dueOn}, ${f.daysLeft} day${f.daysLeft === 1 ? '' : 's'} left (ref ${f.id})`)
      }
      lines.push('')
    }
    lines.push('Open Data Requests in the admin app to answer them.')

    await step.run('report', () =>
      raiseOperationalAlert({
        code: breached.length > 0 ? 'DSR_DEADLINE_BREACHED' : 'DSR_DEADLINE_APPROACHING',
        severity,
        title,
        // Only kinds, dates and references. What the requester actually asked
        // for stays in the admin app, behind a login — see the survey for why.
        body: lines.join('\n'),
        entityId: new Date().toISOString().slice(0, 10),
        payload: {
          breached: breached.map((f) => ({ id: f.id, kind: f.kind, daysLate: -f.daysLeft })),
          approaching: approaching.map((f) => ({ id: f.id, kind: f.kind, daysLeft: f.daysLeft })),
        },
      }),
    )

    await step.run('heartbeat', () => recordJobHeartbeat('dsr-deadline-check'))

    logger.info('DSR deadline check completed', {
      breached: breached.length,
      approaching: approaching.length,
    })
    return { breached: breached.length, approaching: approaching.length }
  },
)
