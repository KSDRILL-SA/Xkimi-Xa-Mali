import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { assessMemberRisks, needsUrgentWarning, needsHumanOutreach } from '@/services/risk.service'
import { notifyAdmins } from '@/services/inbox.service'
import { todaySAST } from '@/lib/date'
import { logger } from '@xxm/observability'
import { queueNotification } from '@/services/notification.service'
import { planDebitWarnings } from '@/services/mandate.service'


export const debitMorningWarning = inngest.createFunction(
  { id: 'debit-morning-warning', name: 'Debit Morning Warning' },
  { cron: '0 6 * * *' }, // 08:00 SAST (UTC+2)
  async ({ step }) => {
    const today = await step.run('get-today', () => todaySAST())
    const [year, month, dayStr] = today.split('-')
    if (!year || !month || !dayStr) {
      throw new Error(`debit-morning-warning: unexpected date format from todaySAST(): ${today}`)
    }
    const dayOfMonth = parseInt(dayStr, 10)
    const periodYear = parseInt(year, 10)
    const periodMonth = parseInt(month, 10)

    const mandates = await step.run('find-mandates', () =>
      db.paymentMandate.findMany({
        where: { status: 'ACTIVE', debitDay: dayOfMonth },
        include: { user: { select: { id: true, status: true } } },
      }),
    )

    if (mandates.length === 0) return { total: 0, warned: 0, atRisk: 0 }

    const userIds = mandates.map((m) => m.userId)

    // Who is already settled for this period (the debit will not run for them),
    // and how much trouble each member is in. The risk judgement comes from
    // risk.service rather than being worked out here: it used to be computed in
    // this job with one window and again in the member's own insights with
    // another, so a member could read "Action needed" in the app and get the
    // calm SMS the same morning.
    const context = await step.run('fetch-context', async () => {
      const [settledRows, risks] = await Promise.all([
        db.contribution.findMany({
          where: { userId: { in: userIds }, periodMonth, periodYear, status: { in: ['PAID', 'WAIVED'] } },
          select: { userId: true },
        }),
        assessMemberRisks(userIds),
      ])
      return {
        settled: settledRows.map((r) => r.userId),
        // Anyone not steady is warned more firmly; the tier also says who a
        // brother should follow up with, which the next step acts on.
        atRisk: [...risks.values()].filter(needsUrgentWarning).map((r) => r.userId),
        outreach: [...risks.values()].filter(needsHumanOutreach).map((r) => ({
          userId: r.userId, reasons: r.reasons,
        })),
      }
    })

    const targets = planDebitWarnings(
      mandates.map((m) => ({
        id: m.id, userId: m.userId, amount: Number(m.amount),
        userStatus: m.user.status, delayedUntil: m.delayedUntil,
      })),
      new Set(context.settled),
      new Set(context.atRisk),
    )

    let warned = 0
    for (const target of targets) {
      await step.run(`notify-${target.mandateId}`, () =>
        queueNotification({
          userId: target.userId,
          // At-risk members (a recent debit failed) get the stronger reminder.
          templateSlug: target.atRisk ? 'debit-morning-warning-urgent' : 'debit-morning-warning',
          channel: 'SMS',
          payload: {
            mandateId: target.mandateId,
            date: today,
            amount: target.amount.toString(),
            atRisk: target.atRisk,
          },
        }),
      )
      warned += 1
    }

    // The part that was missing. The system has always known which members were
    // struggling — it computed the signal, sent one SMS and told nobody. On a
    // platform whose whole premise is a brotherhood, a member with a pattern of
    // declines should reach a person, not just their own phone.
    //
    // Only members still unwarned-for-settlement are worth raising: someone who
    // has already paid this period does not need a call. Once per run, so a
    // long-standing problem does not become a daily alert.
    const warnedIds = new Set(targets.map((t) => t.userId))
    const outreach = context.outreach.filter((o) => warnedIds.has(o.userId))

    const escalated = await step.run('escalate-to-brothers', async () => {
      if (outreach.length === 0) return 0

      const members = await db.user.findMany({
        where: { id: { in: outreach.map((o) => o.userId) } },
        select: { id: true, firstName: true, lastName: true },
      })

      const nameOf = new Map(members.map((m) => [m.id, `${m.firstName} ${m.lastName}`]))
      const lines = outreach.map((o) => `• ${nameOf.get(o.userId) ?? 'A member'} — ${o.reasons.join(', ')}`)

      const reached = await notifyAdmins({
        title: outreach.length === 1 ? 'A brother could use a check-in' : `${outreach.length} brothers could use a check-in`,
        body: [
          `Today's debit run flagged the following, based on declined debits and overdue contributions:`,
          '',
          ...lines,
          '',
          'They have had the reminder by SMS. A quiet word from one of us tends to work better than another message.',
        ].join('\n'),
      })

      // Nothing was actually raised if there is nobody active to raise it with.
      return reached > 0 ? outreach.length : 0
    })

    const atRiskCount = targets.filter((t) => t.atRisk).length
    logger.info('Debit morning warning sent', {
      escalatedForOutreach: escalated,
      dueToday: mandates.length,
      settledSkipped: mandates.length - targets.length,
      warned,
      atRisk: atRiskCount,
    })

    return { total: mandates.length, warned, atRisk: atRiskCount, escalated }
  },
)
