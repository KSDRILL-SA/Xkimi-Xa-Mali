import { describe, it, expect } from 'vitest'
import { refuseForStanding, isInGoodStanding, standingRefusalMessage } from '../membership-standing'

/**
 * A resigned member keeps their account and their history. What they are not is
 * a participant.
 *
 * Sign-in lets them through on purpose. But every member-facing service gates
 * on `assertCanAccess` — is this your own data — and none asked whether the
 * person is still a member, so somebody who had left could still pay a
 * contribution, set up a debit order, fund a goal and post to the circle.
 */

/**
 * Every member-facing path that changes something, as of this pass.
 *
 * Listed so the rule can be seen applied to the real surface rather than to a
 * couple of examples. A path added later is refused by default until somebody
 * decides it belongs on the self-care list — which is the point of writing it
 * this way round.
 */
const PARTICIPATION = [
  '/api/v1/contributions/pay',
  '/api/v1/mandates',
  '/api/v1/mandates/abc123',
  '/api/v1/mandates/abc123/delay',
  '/api/v1/bank-accounts',
  '/api/v1/bank-accounts/abc123',
  '/api/v1/goals/abc123/pay',
  '/api/v1/goals/abc123/pledge',
  '/api/v1/goals/abc123/cheer',
  '/api/v1/goals/abc123/comments',
  '/api/v1/goals/propose',
  '/api/v1/goal-plans',
  '/api/v1/goal-plans/abc123',
  '/api/v1/community/messages',
  '/api/v1/budgets/me',
]

const SELF_CARE = [
  '/api/v1/auth/change-password',
  '/api/v1/notifications/preferences',
  '/api/v1/notifications/preferences/whatsapp',
  '/api/v1/inbox/abc123',
  '/api/v1/inbox/read-all',
  '/api/v1/members/me/leave',
]

describe('who counts as taking part', () => {
  it('is only an active member', () => {
    expect(isInGoodStanding('ACTIVE')).toBe(true)
    for (const s of ['RESIGNED', 'SUSPENDED', 'PENDING']) {
      expect(isInGoodStanding(s), s).toBe(false)
    }
  })
})

describe('a member who has left', () => {
  it('is refused every path that would have them take part again', () => {
    for (const path of PARTICIPATION) {
      expect(refuseForStanding('RESIGNED', 'POST', path), path).toBe(true)
    }
  })

  it('can still read everything of their own', () => {
    // The whole promise is that the history stays theirs. Statements, exports,
    // contribution records — none of it is gated here.
    for (const path of [...PARTICIPATION, '/api/v1/transactions/statement', '/api/v1/members/u1/export']) {
      expect(refuseForStanding('RESIGNED', 'GET', path), path).toBe(false)
    }
  })

  it('can still look after the account they still hold', () => {
    // Someone who has left has more reason to change their password, not less,
    // and refusing preference changes would leave them receiving reminders with
    // no way to stop them.
    for (const path of SELF_CARE) {
      expect(refuseForStanding('RESIGNED', 'PATCH', path), path).toBe(false)
      expect(refuseForStanding('RESIGNED', 'POST', path), path).toBe(false)
    }
  })

  it('is told why, in words meant for a person', () => {
    expect(standingRefusalMessage('RESIGNED')).toMatch(/left the Foundation/i)
    expect(standingRefusalMessage('RESIGNED')).toMatch(/history stay/i)
  })
})

describe('a member in good standing', () => {
  it('is refused nothing by this rule', () => {
    for (const path of [...PARTICIPATION, ...SELF_CARE]) {
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        expect(refuseForStanding('ACTIVE', method, path), `${method} ${path}`).toBe(false)
      }
    }
  })
})

describe('the other statuses that are not participation', () => {
  it('holds a suspended member to the same line', () => {
    // Sign-in already refuses them, so this is defence in depth rather than the
    // only gate — but a rule that applies to one non-participant and not
    // another is a rule waiting to be got wrong.
    expect(refuseForStanding('SUSPENDED', 'POST', '/api/v1/contributions/pay')).toBe(true)
    expect(refuseForStanding('PENDING', 'POST', '/api/v1/contributions/pay')).toBe(true)
  })

  it('says something true to each of them', () => {
    expect(standingRefusalMessage('SUSPENDED')).toMatch(/suspended/i)
    expect(standingRefusalMessage('PENDING')).toMatch(/not active yet/i)
  })
})

describe('the shape of the rule', () => {
  it('refuses an unknown path by default, rather than allowing it', () => {
    // The reason this is a list of exceptions. A route added next month is
    // refused until somebody decides it belongs, instead of quietly working.
    expect(refuseForStanding('RESIGNED', 'POST', '/api/v1/something-invented-later')).toBe(true)
  })

  it('does not let a prefix match too generously', () => {
    // `/api/v1/inbox` is self-care; a path that merely starts with those
    // letters is not.
    expect(refuseForStanding('RESIGNED', 'POST', '/api/v1/inbox-broadcast')).toBe(true)
    expect(refuseForStanding('RESIGNED', 'POST', '/api/v1/inbox/abc/read')).toBe(false)
  })
})
