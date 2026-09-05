import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isDueOn, periodKey } from '@/lib/goal-plan-schedule'

// ---------------------------------------------------------------------------
// A monthly plan without anything to collect with.
//
// A plan was built as an instruction to a debit order: enrolment demanded an
// active mandate and the daily run PAUSED any plan whose mandate had gone. The
// DebiCheck application was declined, so no member holds a mandate — which made
// the feature unreachable. The app offered it and refused every attempt, and
// the refusal told members to "set one up", of a thing that cannot be had.
//
// That was the wrong reading of what a plan is. A plan is a member's standing
// commitment to a goal; a debit order was one way of honouring it. The other is
// the way every rand currently arrives — the member pays, an administrator
// records it.
//
// So the monthly event becomes a REQUEST, and an offline payment against the
// goal is what closes it.
// ---------------------------------------------------------------------------

const WEB = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(WEB, rel), 'utf8')

/** Source with comments stripped — twice now, a test has matched its own explanation. */
const code = (src: string) =>
  src
    .split(String.fromCharCode(10))
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join(String.fromCharCode(10))

describe('a plan is handled once a month, whichever way it was handled', () => {
  const onTheFifth = new Date(2026, 8, 5) // 2026-09-05
  const plan = { debitDay: 5, lastCollectedPeriod: null, lastRequestedPeriod: null }

  it('is due on its day when nothing has happened yet', () => {
    expect(isDueOn(plan, onTheFifth)).toBe(true)
  })

  it('is not due again once money was collected for the period', () => {
    expect(isDueOn({ ...plan, lastCollectedPeriod: '2026-09' }, onTheFifth)).toBe(false)
  })

  it('is not due again once the member was merely ASKED for the period', () => {
    // The stamp that did not exist. Without it the daily job would ask again on
    // every retry within the day — and a message about money that repeats is a
    // message people learn to ignore.
    expect(isDueOn({ ...plan, lastRequestedPeriod: '2026-09' }, onTheFifth)).toBe(false)
  })

  it('is due again the following month after a request', () => {
    expect(isDueOn({ ...plan, lastRequestedPeriod: '2026-09' }, new Date(2026, 9, 5))).toBe(true)
  })

  it('does not charge a month it already asked for, if a provider appears mid-month', () => {
    // The cutover case. A plan asked on the 5th and a gateway configured on the
    // 6th must not then also collect for September — the member would pay the
    // request AND be debited for the same instalment.
    expect(isDueOn({ debitDay: 5, lastCollectedPeriod: null, lastRequestedPeriod: '2026-09' }, onTheFifth))
      .toBe(false)
  })

  it('treats a plan with no request stamp exactly as before', () => {
    // The field is optional on the type so every existing caller keeps working.
    expect(isDueOn({ debitDay: 5, lastCollectedPeriod: null }, onTheFifth)).toBe(true)
  })
})

describe('the mandate is required only where a mandate would be used', () => {
  const src = () => code(read('services/goal-plan.service.ts'))

  it('gates enrolment on whether anything can actually collect', () => {
    expect(src()).toContain('if (GATEWAY_CAN_MOVE_MONEY) {')
  })

  it('does not ask for a mandate unconditionally any more', () => {
    // The exact shape of the defect: a bare mandate lookup followed by a throw,
    // with nothing deciding whether the question was worth asking.
    const s = src()
    const unconditional =
      /\n {2}const mandate = await mandateRepo\.findActiveByUser\(userId\)\n {2}if \(!mandate/
    expect(s).not.toMatch(unconditional)
  })

  it('gates resuming a paused plan the same way', () => {
    // Plans paused while a provider existed are exactly the ones a member wants
    // back. Refusing them for the absence of a mandate nothing intends to use
    // would strand them for good.
    const s = src()
    expect(s.match(/if \(GATEWAY_CAN_MOVE_MONEY\) \{/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})

describe('the monthly run asks when it cannot collect', () => {
  const src = () => code(read('services/goal-plan.service.ts'))

  it('stamps the request, never the collection', () => {
    // The single most important line in the change. Stamping
    // `lastCollectedPeriod` here would make a plan that was merely asked look
    // collected — a money record saying money moved when none did.
    const s = src()
    expect(s).toContain('lastRequestedPeriod: period,')
    expect(s).toMatch(/if \(!GATEWAY_CAN_MOVE_MONEY\) \{[\s\S]{0,400}lastRequestedPeriod: period,/)
  })

  it('does not pause the plan for a missing mandate when none can exist', () => {
    // Pausing every plan for a permanent condition, with a message telling the
    // member to fix it, is worse than not offering the feature.
    const s = src()
    const requestBlock = s.slice(s.indexOf('if (!GATEWAY_CAN_MOVE_MONEY) {'))
    const untilContinue = requestBlock.slice(0, requestBlock.indexOf('continue'))
    expect(untilContinue).not.toContain("status: 'PAUSED'")
  })

  it('tells the member what to do, with the amount', () => {
    const s = src()
    expect(s).toContain("templateSlug: 'goal-plan-due'")
    expect(s).toMatch(/payload: \{ goal: goal\.title, amount:/)
  })

  it('reports requests separately from collections', () => {
    // A run that asked forty members for money and collected nothing is not the
    // same event as one that collected forty times, and a counter that conflates
    // them would say the money arrived.
    const s = src()
    expect(s).toContain('requested')
    expect(s).toContain('return { collected, submitted, failed, completed, paused, requested }')
  })
})

describe('an offline payment closes the plan for that month', () => {
  const src = () => code(read('services/goal-payment.service.ts'))

  it('is called when an administrator records a goal payment', () => {
    expect(src()).toContain('await satisfyPlanForPeriod(data.userId, data.goalId, data.receivedAt)')
  })

  it('uses the period the money ARRIVED in, not today', () => {
    // An administrator catching up in September on a payment made in August is
    // closing August's instalment. Stamping today would leave August unanswered
    // for good, and the member asked for it again next month.
    const s = src()
    expect(s).toContain('data.receivedAt')
    expect(s).toContain('const period = periodKey(receivedAt)')
  })

  it('marks it collected, because this time money really did move', () => {
    const s = src()
    expect(s).toMatch(/lastCollectedPeriod: period,/)
  })

  it('never fails the recording of money that arrived', () => {
    // The plan's bookkeeping is a projection. Throwing here would turn a
    // cosmetic problem into a refusal to record a payment the member has
    // already made — the one outcome refused everywhere else in this system.
    const s = src()
    const fn = s.slice(s.indexOf('async function satisfyPlanForPeriod'))
    expect(fn.slice(0, fn.indexOf('export async function'))).toContain('catch (err)')
  })
})

describe('the period key both halves agree on', () => {
  it('is the same function on both sides of the request', () => {
    // The run stamps `lastRequestedPeriod` and the offline payment stamps
    // `lastCollectedPeriod`. If the two computed the period differently they
    // would never cancel out, and every plan would be asked for every month
    // forever regardless of what the member paid.
    expect(periodKey(new Date(2026, 8, 30))).toBe('2026-09')
    expect(periodKey(new Date(2026, 8, 1))).toBe('2026-09')
    expect(read('services/goal-payment.service.ts')).toContain("from '@/lib/goal-plan-schedule'")
  })
})
