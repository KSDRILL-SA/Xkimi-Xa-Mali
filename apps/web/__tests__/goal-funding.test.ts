import { describe, it, expect } from 'vitest'
import { needsOverfundingConfirmation } from '@/lib/goal-funding'

/**
 * The Make a Payment page can now send money to a chosen goal, and `payToGoal`
 * has never compared the amount against the target. Nothing stopped R5 000 from
 * going into a goal that needed R200.
 */
describe('overfunding a goal', () => {
  it('asks before charging more than the goal needs', () => {
    expect(needsOverfundingConfirmation(2000, 644)).toBe(true)
  })

  it('says nothing when the amount fits', () => {
    expect(needsOverfundingConfirmation(500, 644)).toBe(false)
  })

  it('says nothing when the amount is exactly what is left', () => {
    // The natural thing to do after being offered "pay R644 instead". If this
    // asked again the member could never get out of the confirmation.
    expect(needsOverfundingConfirmation(644, 644)).toBe(false)
  })

  it('does not ask when the goal has already met its target', () => {
    // Nothing is left to need, so there is no smaller amount to offer. The
    // confirmation would have to say "pay R0 instead", which is not a choice —
    // it is a dead end on the page whose whole purpose is taking a payment.
    expect(needsOverfundingConfirmation(100, 0)).toBe(false)
  })

  it('does not ask when the goal is somehow past its target', () => {
    // `remaining` is clamped at zero by the serializer, but a negative value
    // reaching here must behave like a met target rather than inverting the
    // comparison and asking on every payment.
    expect(needsOverfundingConfirmation(100, -50)).toBe(false)
  })
})
