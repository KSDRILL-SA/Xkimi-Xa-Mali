import { raiseOperationalAlert } from '@/services/alert.service'

/**
 * What happens when a scheduled job gives up.
 *
 * Inngest retries a failing function and then stops. Until now, stopping was
 * the end of it: the failure was visible in the Inngest dashboard and nowhere
 * else. For most jobs that is a Monday-morning problem. For the debit run it is
 * the whole system failing silently on the one night it matters — no
 * collections, no transactions, no member notifications, and no alert either,
 * because every alert this codebase raises is raised *by* the job that just
 * died.
 *
 * `onFailure` runs after the last retry is exhausted, in a separate invocation,
 * so it survives whatever killed the run itself.
 *
 * This is the outer net. The inner ones — a mandate that throws is isolated by
 * `processMandateBatch`, a gateway call that fails is recorded as a `FAILED`
 * transaction — still do the work. This only catches what gets past them.
 */

/** The shape of `inngest/function.failed` this handler reads. */
interface FailureContext {
  error: unknown
  event?: {
    data?: {
      function_id?: string
      run_id?: string
      event?: { name?: string } | null
    } | null
  } | null
}

/**
 * Build an `onFailure` handler that raises a critical operational alert.
 *
 * `label` is what a person should read at 18:20 on debit night — "The monthly
 * debit run", not `debit-run`. The function id is carried in the payload for
 * whoever goes looking in Inngest afterwards.
 */
export function alertOnFailure(label: string) {
  return async (ctx: FailureContext): Promise<void> => {
    const reason = ctx.error instanceof Error ? ctx.error.message : String(ctx.error)
    const functionId = ctx.event?.data?.function_id ?? 'unknown'
    const runId = ctx.event?.data?.run_id ?? 'unknown'

    await raiseOperationalAlert({
      code: 'SCHEDULED_JOB_FAILED',
      // Always critical. A job on this list only earns a place by being one
      // whose silence costs money, so there is no severity judgement to make
      // at the moment of failure — that judgement was made when it was added.
      severity: 'critical',
      // Plain ASCII, short: this goes out as an SMS. The reason can be long and
      // can contain anything a stack trace contains, so it stays in the body.
      title: `${label} failed and did not complete`,
      body: [
        `${label} exhausted its retries and stopped.`,
        '',
        `Reason: ${reason}`,
        '',
        `Job: ${functionId}`,
        `Run: ${runId}`,
        '',
        'Nothing this job was supposed to do has been done. Check the Inngest',
        'dashboard for the failed run, then follow docs/runbook.md.',
      ].join('\n'),
      entityId: functionId,
      payload: { functionId, runId, reason },
    })
  }
}
