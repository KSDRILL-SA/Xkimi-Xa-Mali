import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Every member-facing route that takes an object id, and how each one proves
// the caller may have it.
//
// A4-F45 asked whether any endpoint authenticates without authorising. The
// answer, after reading them, was no — and that answer had a shelf life of
// exactly one new route. A reading is a fact about a Tuesday; this is the pin
// that was owed.
//
// It works by refusing to be silent. A dynamic route that is not listed below
// fails this suite, so adding one forces somebody to write down which of the
// four mechanisms it uses. That is the same shape as `services.authz.test.ts`
// in the admin app, which refuses to let a new admin service go unregistered.
//
// ── The four mechanisms, and why the distinction matters ───────────────────
//
// `scoped-query`  The query itself carries the owner: findByIdAndUser,
//                 findFirst({ id, userId }), deleteMany({ id, userId }). Cannot
//                 leak, because a row belonging to somebody else is simply not
//                 returned. The strongest of the four.
//
// `loaded-then-checked`  Load by id, then prove ownership against the loaded
//                 row. Correct, and it is where A4-F46 lived — answering "no
//                 such thing" and "not yours" differently tells a stranger
//                 which ids are real.
//
// `param-is-the-subject`  The [id] IS a user id, and authorisation happens
//                 BEFORE any lookup. Leaks nothing: a stranger's id and a
//                 nonexistent one are refused identically.
//
// `group-visible`  Every member may read it — the community board, a goal, its
//                 comments. Existence is not a secret, so only mutation needs
//                 an ownership or role check. Marking one of these wrongly is
//                 how a private object becomes a public one, which is why they
//                 are listed rather than inferred.
// ---------------------------------------------------------------------------

const API = path.resolve(__dirname, '../app/api/v1')

type Mechanism = 'scoped-query' | 'loaded-then-checked' | 'param-is-the-subject' | 'group-visible'

/**
 * Every member-facing route with a dynamic segment.
 *
 * Admin routes are deliberately absent: they are guarded by `assertAdmin` plus
 * the trusted-internal channel, and `internal-admin-actor.test.ts` holds that
 * line separately.
 */
const ROUTES: Array<{ path: string; mechanism: Mechanism; note: string }> = [
  {
    path: 'bank-accounts/[id]',
    mechanism: 'scoped-query',
    note: 'findByIdAndUser — the account and the owner in one query',
  },
  {
    path: 'budgets/me/[type]',
    mechanism: 'param-is-the-subject',
    note: 'the segment is a budget TYPE, not an id; the subject is always the session',
  },
  {
    path: 'community/messages/[id]',
    mechanism: 'group-visible',
    note: 'the whole circle reads the board; editing and deleting check message.userId',
  },
  {
    path: 'contributions/[id]',
    mechanism: 'loaded-then-checked',
    note: 'getContribution — !contribution || !canAccess, one answer for both',
  },
  {
    path: 'goal-plans/[id]',
    mechanism: 'loaded-then-checked',
    note: '!plan || plan.userId !== userId, combined so neither case is distinguishable',
  },
  {
    path: 'goals/[id]',
    mechanism: 'group-visible',
    note: 'a goal belongs to the circle; drafts are admin-only, and roles are passed to getGoal',
  },
  {
    path: 'goals/[id]/activate',
    mechanism: 'group-visible',
    note: 'mutation — activateGoal takes the requester and its roles',
  },
  {
    path: 'goals/[id]/cheer',
    mechanism: 'group-visible',
    note: 'any member may cheer any goal; the cheer is keyed to the session user',
  },
  {
    path: 'goals/[id]/comments',
    mechanism: 'group-visible',
    note: 'comments are visible to the circle; authorship comes from the session',
  },
  {
    path: 'goals/[id]/comments/[commentId]',
    mechanism: 'loaded-then-checked',
    note: 'deleteGoalComment — comment.userId or admin, and the comment must belong to the goal',
  },
  {
    path: 'goals/[id]/lock',
    mechanism: 'group-visible',
    note: 'mutation — lockGoal takes the requester and its roles',
  },
  {
    path: 'goals/[id]/pay',
    mechanism: 'param-is-the-subject',
    note: 'payToGoal receives session.user.id as BOTH subject and requester; the body cannot reach it',
  },
  {
    path: 'goals/[id]/pledge',
    mechanism: 'group-visible',
    note: 'a pledge is keyed to the session user; cancelling only reaches their own',
  },
  {
    path: 'goals/[id]/primary',
    mechanism: 'group-visible',
    note: 'mutation — setPrimaryGoal takes the requester and its roles',
  },
  {
    path: 'goals/[id]/progress',
    mechanism: 'group-visible',
    note: 'progress on a circle goal; drafts admin-only via getGoal(id, roles)',
  },
  {
    path: 'inbox/[id]',
    mechanism: 'scoped-query',
    note: 'findFirst({ id, userId }) and deleteMany({ id, userId })',
  },
  {
    path: 'mandates/[id]',
    mechanism: 'loaded-then-checked',
    note: '!mandate || !canAccess — one answer for absent and not-yours (A4-F46)',
  },
  {
    path: 'mandates/[id]/delay',
    mechanism: 'loaded-then-checked',
    note: 'requestDelay, same combined check',
  },
  {
    path: 'members/[id]',
    mechanism: 'param-is-the-subject',
    note: 'assertCanAccess on the parameter, BEFORE any lookup — leaks nothing',
  },
  {
    path: 'members/[id]/export',
    mechanism: 'param-is-the-subject',
    note: 'same, and this one hands over everything we hold about a person',
  },
  {
    path: 'members/[id]/summary',
    mechanism: 'param-is-the-subject',
    note: 'same',
  },
]

function dynamicRoutes(dir: string, prefix = ''): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...dynamicRoutes(full, prefix ? `${prefix}/${entry}` : entry))
    } else if (entry === 'route.ts' && prefix.includes('[')) {
      out.push(prefix)
    }
  }
  return out
}

/** Everything under /admin is held by internal-admin-actor.test.ts instead. */
const found = dynamicRoutes(API).filter((r) => !r.startsWith('admin/')).sort()
const declared = new Set(ROUTES.map((r) => r.path))
const read = (route: string) => readFileSync(path.join(API, route, 'route.ts'), 'utf8')

/**
 * Source with comments removed.
 *
 * Written after the first run of this file matched the word "403" inside
 * `inbox/[id]`'s comment explaining that it deliberately returns 404 instead —
 * a check that fails on prose describing the correct behaviour is worse than no
 * check, and this is the second time in this repository that exact mistake has
 * been made.
 */
const code = (route: string) =>
  read(route)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join(String.fromCharCode(10))

describe('every object-id route is accounted for', () => {
  it('declares each one, so a new route cannot arrive unexamined', () => {
    // The whole point. A reading of the routes is a fact about the day it was
    // done; this makes the next one someone's explicit decision.
    const undeclared = found.filter((r) => !declared.has(r))

    expect(undeclared, 'add it to ROUTES with the mechanism it uses').toEqual([])
  })

  it('does not list routes that no longer exist', () => {
    // A manifest that drifts the other way is a manifest nobody trusts.
    const stale = [...declared].filter((r) => !found.includes(r))

    expect(stale).toEqual([])
  })

  it('is actually looking at something', () => {
    expect(found.length).toBeGreaterThan(15)
  })
})

describe('each route does what it says it does', () => {
  it.each(ROUTES)('$path takes its caller from the session', ({ path: route }) => {
    // The finding A4-F51 checked for, pinned rather than re-read: identity comes
    // from the authenticated session, never from the request body.
    const src = read(route)

    expect(src).toContain('session.user.id')
  })

  it.each(ROUTES)('$path refuses an unauthenticated caller', ({ path: route }) => {
    // Two shapes are in use — `!session?.user` and `!session?.user?.id` — and
    // both refuse. The looser one is not a hole: an id-less session would pass
    // `undefined` as the requester, and every downstream check compares it to a
    // real owner id, so it fails closed. Accepted rather than churned, and noted
    // because a reader will otherwise wonder which is right.
    expect(code(route)).toMatch(/if \(!session\?\.user(\?\.id)?\)/)
  })

  it.each(ROUTES.filter((r) => r.mechanism !== 'group-visible'))(
    '$path does not answer "not yours" and "not there" differently',
    ({ path: route }) => {
      // A4-F46. Only for objects a member could not otherwise enumerate — the
      // group-visible ones are deliberately excluded, because "not found" for a
      // goal everybody can see would be a lie.
      // `SYS_006` is allowed through: it is the member-payments kill switch
      // refusing a *capability*, not an object. Refusing to do something at all
      // reveals nothing about whose it is.
      const src = code(route).replace(/apiError\('SYS_006'[^)]*\)/g, '')

      expect(src).not.toMatch(/status === 'DRAFT'/)
      expect(src).not.toMatch(/403/)
    },
  )
})

describe('the rule about drafts lives in one place', () => {
  // It lived in two, and the copy that ran first was the one that did not know
  // about admins. `getGoal` defaults `roles` to `[]` and throws for a draft
  // before returning, so the route's own careful `roles.includes('ADMIN')`
  // branch could never execute — an admin saw a draft in the list, opened it,
  // and got "not found".

  it('the goal routes pass roles to getGoal rather than re-checking after it', () => {
    for (const route of ['goals/[id]', 'goals/[id]/progress']) {
      const src = read(route)

      expect(src, route).toMatch(/getGoal\(id, roles\)/)
      expect(src, route).not.toMatch(/goal\.status === 'DRAFT'/)
    }
  })

  it('the list route already passed them, which is how the two disagreed', () => {
    expect(read('goals')).toMatch(/getGoals\([^)]*roles\)/)
  })
})
