import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { SUCCESSFUL_INFLOW } from '@/repositories/transaction.repository'

// ---------------------------------------------------------------------------
// A status for "we submitted it and do not know what happened".
//
// The system could say SUCCESS or FAILED about a money movement, and nothing
// else. So when a submission timed out — the request gone, no answer back, the
// bank possibly holding the member's money — it had to guess.
//
// **Two schedulers guessed differently, and that is the tell.**
//
//   - The debit run called an unknown outcome FAILED. `transaction-retry-failed`
//     collects exactly `status: 'FAILED'`, so a timeout on a debit the bank had
//     accepted went into the recovery pool and was submitted again.
//   - The goal plan called anything that was not FAILED collected, and reset
//     `failedRuns` to zero on a PENDING that had settled nothing — so a plan
//     submitting pending-and-never-settling forever never accumulated a failure
//     and never tripped the pause-and-tell-the-member path.
//
// One absent distinction, two opposite wrong answers. For money movement a
// timeout is not a failure: it is an absence of information, and the two demand
// opposite responses. Retry a decline. Resolve an unknown before attempting
// anything else.
//
// ── What UNKNOWN must never be counted as ──────────────────────────────────
//
// Not an inflow. Money whose fate nobody knows has not been received, so it
// credits no pool, settles no contribution and appears in no member's total.
// The fund understates rather than overstates until the truth is known, which
// is the safe direction to be wrong in.
//
// Nobody resolves an UNKNOWN automatically yet, and that is honest rather than
// unfinished: the thing that will resolve it is the Netcash load report, which
// is Phase 3 and needs a gateway that does not exist. Until then the run's
// alert says plainly that these are not being retried and need a person.
// ---------------------------------------------------------------------------

const WEB = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(WEB, rel), 'utf8')

describe('UNKNOWN is not money', () => {
  it('is excluded from every settled inflow', () => {
    // The single filter behind contribution totals, the pool ledger backfill
    // and every member-facing figure. It matches SUCCESS and nothing else.
    expect(SUCCESSFUL_INFLOW).toMatchObject({ status: 'SUCCESS' })
  })

  it('is excluded from the raw-SQL twin of that filter', async () => {
    const { SUCCESSFUL_INFLOW_SQL } = await import('@/repositories/transaction.repository')

    expect(SUCCESSFUL_INFLOW_SQL).toContain("t.status = 'SUCCESS'")
    expect(SUCCESSFUL_INFLOW_SQL).not.toContain('UNKNOWN')
  })

  it('exists in the schema with the reasoning attached', () => {
    const schema = readFileSync(
      path.resolve(WEB, '../../packages/database/prisma/schema.prisma'), 'utf8',
    )
    const block = schema.slice(schema.indexOf('enum TransactionStatus'))

    expect(block.slice(0, 900)).toContain('UNKNOWN')
    expect(block.slice(0, 900)).toMatch(/outcome unknown/i)
  })

  it('was added by migration rather than only in the schema', () => {
    // A Prisma enum value that never reached Postgres is a runtime error on
    // the first row that uses it.
    const sql = readFileSync(
      path.resolve(WEB, '../../packages/database/prisma/migrations/20260905080000_unknown_outcome/migration.sql'),
      'utf8',
    )

    expect(sql).toContain(`ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'UNKNOWN'`)
  })
})

describe('an unknown outcome is not retried', () => {
  it('the recovery job collects FAILED and not UNKNOWN', () => {
    // FAILED means the bank refused and nothing was taken, so submitting again
    // is right. UNKNOWN means the submission may have landed, and retrying that
    // is how a member is debited twice for one month.
    const src = read('inngest/functions/transaction-retry-failed.ts')
    const query = src.slice(src.indexOf('find-retryable'), src.indexOf('find-retryable') + 1200)

    expect(query).toContain("status: 'FAILED'")
    expect(query).not.toMatch(/status: \{ in: \[/)
    expect(query).not.toContain("'UNKNOWN'")
  })

  it('the debit run records a lost submission as UNKNOWN', () => {
    const src = read('inngest/functions/debit-run.ts')
    const block = src.slice(src.indexOf('record-unknown'), src.indexOf('record-unknown') + 700)

    expect(block).toContain("status: 'UNKNOWN'")
    expect(block).not.toContain("status: 'FAILED'")
  })

  it('the delayed-debit handler does the same', () => {
    // The sibling path, and it had the identical defect. Fixing one and not the
    // other is how three copies of a bug survived three separate fixes here.
    const src = read('inngest/functions/mandate-delay-handler.ts')
    const block = src.slice(src.indexOf('record-unknown'), src.indexOf('record-unknown') + 700)

    expect(block).toContain("status: 'UNKNOWN'")
  })

  it('the run tells leadership these are waiting on a person', () => {
    // An alert that lists them beside declines, without saying they are not
    // being retried, reads as "the usual recovery is under way". It is not.
    const src = read('inngest/functions/debit-run.ts')

    expect(src).toMatch(/NOT being/)
    expect(src).toMatch(/debited twice/)
  })
})

describe('the goal plan stopped guessing the other way', () => {
  it('counts a submitted collection separately from a settled one', () => {
    const src = read('services/goal-plan.service.ts')

    expect(src).toContain('submitted += 1')
    expect(src).toMatch(/res\.status === 'SUCCESS'/)
  })

  it('does not clear the failure counter on something that never settled', () => {
    // The bite. `failedRuns` is what pauses a plan that keeps failing and tells
    // the member why; resetting it on a PENDING meant a plan could submit
    // forever, settle nothing, and never pause.
    const src = read('services/goal-plan.service.ts')
    const collectBlock = src.slice(src.indexOf("if (res.status === 'FAILED')"))

    const clearAt = collectBlock.indexOf('clearFailures')
    const successAt = collectBlock.indexOf("res.status === 'SUCCESS'")

    expect(successAt).toBeGreaterThan(-1)
    expect(clearAt).toBeGreaterThan(successAt)
  })
})
