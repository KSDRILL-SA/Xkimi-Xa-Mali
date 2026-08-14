import { inngest } from '@/lib/inngest'
import { surveyRetention } from '@/services/retention.service'
import { raiseOperationalAlert } from '@/services/alert.service'
import { recordJobHeartbeat } from '@/lib/job-heartbeat'
import { logger } from '@xxm/observability'

/**
 * Monthly POPIA section 14 retention survey.
 *
 * Reports what is past its retention period and deletes nothing — see the note
 * in `retention.service.ts` for why that division is the point rather than a
 * compromise.
 *
 * Monthly, not nightly: this produces a decision for a human, and a decision
 * nobody has time to take arrives as noise. Twelve a year is a cadence a
 * fifty-person collective can actually act on.
 *
 * `warning` rather than `critical`, which in this service is a decision about
 * reach and not about tone: `critical` also sends an SMS, and that is reserved
 * for money not moving. Nothing here is an incident — data sitting past its
 * period is the expected steady state of a system that keeps records — but it
 * does need to reach a person, and once a month in an inbox and an email is not
 * a volume that trains anyone to ignore the channel.
 */
export const retentionSurvey = inngest.createFunction(
  { id: 'retention-survey', name: 'POPIA Retention Survey' },
  { cron: '0 5 1 * *' }, // 07:00 SAST (UTC+2), 1st of each month
  async ({ step }) => {
    const findings = await step.run('survey', () => surveyRetention())

    if (findings.length === 0) {
      // The heartbeat belongs on this path too, and this is the path it would
      // have been forgotten on: a month with nothing past its period is the
      // *common* outcome and returns early, so recording only after the report
      // would leave the job looking dead for every quiet month — the watcher
      // crying wolf until the first month something turned up.
      await step.run('heartbeat', () => recordJobHeartbeat('retention-survey'))
      logger.info('Retention survey: nothing past its period')
      return { categories: 0, records: 0 }
    }

    const records = findings.reduce((sum, f) => sum + f.count, 0)

    await step.run('report', () =>
      raiseOperationalAlert({
        code: 'RETENTION_REVIEW_DUE',
        severity: 'warning',
        title: `${records} record${records === 1 ? '' : 's'} past retention`,
        body: [
          ...findings.map(
            (f) =>
              `• ${f.category}: ${f.count} older than ${f.olderThan} (${f.policyDays}-day policy) — ${f.describes}`,
          ),
          '',
          'Nothing has been deleted. Review and decide.',
          'Policy: docs/compliance/popia-compliance.md §6',
        ].join('\n'),
        entityId: new Date().toISOString().slice(0, 7),
        payload: { findings },
      }),
    )

    // Written last, so it means "this run reached the end" rather than "this run
    // started" — the same rule the money jobs follow.
    await step.run('heartbeat', () => recordJobHeartbeat('retention-survey'))

    logger.info('Retention survey completed', { categories: findings.length, records })
    return { categories: findings.length, records }
  },
)
