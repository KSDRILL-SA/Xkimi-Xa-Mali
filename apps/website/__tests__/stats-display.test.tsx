// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MAX_MEMBERS } from '@xxm/utils'

/**
 * The only numbers about the Foundation's money that a stranger ever sees.
 *
 * Two defects were found here and both were the same kind: the component
 * invented figures rather than reporting them.
 *
 * `data.members || 4` and `data.monthsActive || 1` turned a legitimate zero
 * into a number nobody could stand behind — the Foundation was publishing
 * "1 month active" while it was in its first month, because `0 || 1` is 1. The
 * fallback for an unreachable API already lives in `lib/stats`; this was a
 * second one, applied to data that had arrived perfectly well.
 *
 * The pooled total was worse. `(total / 1000).toFixed(0)` rounds up, and a `+`
 * was appended unconditionally, so R1 500 was published as "R2k+" and R9 900 as
 * "R10k+". That is not a formatting choice. It is a public claim about other
 * people's money that is larger than the money.
 */

vi.mock('@/hooks/useScrollReveal', () => ({
  useScrollReveal: () => ({ current: null }),
}))

import { StatsDisplay } from '@/components/sections/StatsDisplay'

const stats = (over: Partial<{ members: number; totalPooled: number; monthsActive: number }> = {}) =>
  ({ members: 3, totalPooled: 480, monthsActive: 0, ...over })

afterEach(cleanup)

describe('the pooled total is never larger than the pool', () => {
  it('shows an exact figure under a thousand, with no "+"', () => {
    render(<StatsDisplay data={stats({ totalPooled: 480 })} />)

    // R480 is R480. "R480+" would claim more than the Foundation holds.
    expect(screen.getByText('R480')).toBeTruthy()
  })

  it('floors rather than rounds, so R1 500 is not published as R2k', () => {
    render(<StatsDisplay data={stats({ totalPooled: 1500 })} />)

    expect(screen.getByText('R1k')).toBeTruthy()
    expect(screen.queryByText('R2k')).toBeNull()
  })

  it('floors at the top of a band too — R9 900 is not R10k', () => {
    render(<StatsDisplay data={stats({ totalPooled: 9900 })} />)

    expect(screen.getByText('R9k')).toBeTruthy()
    expect(screen.queryByText('R10k')).toBeNull()
  })

  it('adds "+" only where something was actually truncated', () => {
    const { unmount } = render(<StatsDisplay data={stats({ totalPooled: 9900 })} />)
    expect(screen.getByText('+')).toBeTruthy()
    unmount()

    render(<StatsDisplay data={stats({ totalPooled: 480 })} />)
    expect(screen.queryByText('+')).toBeNull()
  })
})

describe('a real zero is reported, not replaced', () => {
  it('publishes zero months active in the first month', () => {
    render(<StatsDisplay data={stats({ monthsActive: 0 })} />)

    // `0 || 1` published "1". Being new is not something to paper over.
    expect(screen.getByText('0')).toBeTruthy()
  })

  it('publishes the real member count rather than the founder count', () => {
    render(<StatsDisplay data={stats({ members: 3 })} />)

    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.queryByText('4')).toBeNull()
  })
})

describe('when the figures could not be measured', () => {
  it('shows no number at all rather than a plausible one', () => {
    render(<StatsDisplay data={null} />)

    // Three measured tiles, three em dashes. The failure this replaced showed
    // the founder count in the "Active Members" tile during an outage — a
    // hardcoded 4 sitting beside two real figures, with nothing marking it as
    // a guess. At thirty members that is a false statement about the size of
    // the collective, published to the public.
    expect(screen.getAllByText('—')).toHaveLength(3)
    expect(screen.getAllByText('Figure unavailable')).toHaveLength(3)
  })

  it('still shows the member cap, because a rule is not a measurement', () => {
    render(<StatsDisplay data={null} />)

    // The cap comes from the constant the system enforces, not from a fetch.
    // There is nothing to fail to measure, so it survives the outage honestly.
    expect(screen.getByText('Member Cap')).toBeTruthy()
    expect(screen.getByText(String(MAX_MEMBERS))).toBeTruthy()
  })

  it('never prints undefined or NaN', () => {
    const { container } = render(<StatsDisplay data={null} />)

    expect(container.textContent).not.toMatch(/undefined|NaN/)
  })
})

describe('the section itself', () => {
  it('carries an accessible name, so it is findable as a landmark', () => {
    render(<StatsDisplay data={stats()} />)

    expect(screen.getByRole('region', { name: 'Platform statistics' })).toBeTruthy()
  })

  it('labels every figure it shows', () => {
    render(<StatsDisplay data={stats()} />)

    for (const label of ['Active Members', 'Total Pooled', 'Months Active', 'Member Cap']) {
      expect(screen.getByText(label), `${label} is missing`).toBeTruthy()
    }
  })
})
