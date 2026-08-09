/**
 * Whether a payment toward a goal should be questioned before it is charged.
 *
 * `payToGoal` never compares the amount to the target, so any figure goes
 * through however far past the goal it lands. Silently capping it would take
 * the decision away from a member who meant it; saying nothing leaves someone
 * putting R5 000 into a goal that needed R200 with no idea they had.
 *
 * The rule lives here rather than in the form because of the second condition.
 * A goal already at or past its target has nothing left to need, so there is no
 * smaller amount to offer — the confirmation would read "pay R0 instead", which
 * is not a choice. Those goals take the payment without comment; the form says
 * plainly that the target is already met.
 */
export function needsOverfundingConfirmation(amount: number, remaining: number): boolean {
  return remaining > 0 && amount > remaining
}
