import { describe, it, expect, vi } from 'vitest'

/**
 * Which messages a member may switch off.
 *
 * `MANDATORY_SLUGS` bypasses the preference check. Everything outside it can be
 * silenced by a toggle on the notifications page — and two of the messages that
 * say a member's money has stopped moving were outside it.
 *
 * `mandate-cancelled` is sent by `mandate-status-sync` when a DebiCheck
 * authorisation is cancelled at the member's bank, out of band. The comment
 * where it is sent states exactly why it exists: "without this the member's
 * contributions simply stop and the first they hear of it is a gap in their
 * statement". A preference toggle silently dropped it — which defeated the
 * whole purpose of sending it, and left the member believing they were
 * contributing while nothing was collected.
 *
 * `mandate-rejected` is the same failure at the other end: the mandate was
 * never authorised, they will never be debited, and unheard it reads to them as
 * a successful application.
 */

vi.mock('@/lib/env', () => ({ env: { NEXTAUTH_URL: 'https://app.test' } }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/repositories/notification.repository', () => ({ notificationRepo: {} }))
vi.mock('@/repositories/user.repository', () => ({ userRepo: {} }))
vi.mock('@/integrations/sms', () => ({ smsProvider: { send: vi.fn(), normalisePhone: (p: string) => p } }))
vi.mock('@/integrations/email', () => ({ emailProvider: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import { MANDATORY_SLUGS } from '@/services/notification.service'

describe('a member cannot switch off news that their money stopped', () => {
  it('includes the mandate cancelled out of band at their bank', () => {
    expect(MANDATORY_SLUGS.has('mandate-cancelled')).toBe(true)
  })

  it('includes a mandate that was never authorised', () => {
    expect(MANDATORY_SLUGS.has('mandate-rejected')).toBe(true)
  })

  it('still includes every message about a collection that did or did not happen', () => {
    for (const slug of [
      'debit-success',
      'debit-pending',
      'payment-failed-sms',
      'payment-failed-email',
      'overdue-reminder',
      'overdue-reminder-email',
      'contribution-reversed-sms',
      'contribution-reversed-email',
    ]) {
      expect(MANDATORY_SLUGS.has(slug), slug).toBe(true)
    }
  })

  it('still includes the operational alerts that reach admins', () => {
    // An admin who switched SMS off for badge news would otherwise stop being
    // told that a debit run collected nothing.
    expect(MANDATORY_SLUGS.has('admin-alert-sms')).toBe(true)
    expect(MANDATORY_SLUGS.has('admin-alert-email')).toBe(true)
  })
})

describe('the line the list draws', () => {
  // Money that did not move, or is about to stop moving — as against news about
  // it. These are deliberately absent and their absence is a decision, so it is
  // asserted rather than left to be re-argued.

  it('leaves the statement notice optional', () => {
    // `monthly-statement-notice` says so in its own header: a statement is a
    // convenience, and a member who does not want the message can decline it.
    expect(MANDATORY_SLUGS.has('statement-ready-sms')).toBe(false)
    expect(MANDATORY_SLUGS.has('statement-ready-email')).toBe(false)
  })

  it('leaves badge and goal news optional', () => {
    for (const slug of ['badge-level-up', 'badge-level-down', 'goal-achieved', 'goal-activated']) {
      expect(MANDATORY_SLUGS.has(slug), slug).toBe(false)
    }
  })

  it('leaves an approved mandate optional, because it is good news that can wait', () => {
    expect(MANDATORY_SLUGS.has('mandate-approved')).toBe(false)
  })
})

describe('every slug named here is one the codebase actually sends', () => {
  it('has no entry that no caller uses', async () => {
    // A mandatory slug that nothing sends is a rule protecting nothing, and it
    // is how a list like this rots — see the `debit-declined` pair, which was
    // seeded, never sent, and never noticed.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const templates = readFileSync(
      resolve(__dirname, '../../../packages/database/prisma/templates.ts'),
      'utf8',
    )

    for (const slug of MANDATORY_SLUGS) {
      expect(templates, `${slug} is mandatory but not a seeded template`).toContain(`'${slug}'`)
    }
  })
})
