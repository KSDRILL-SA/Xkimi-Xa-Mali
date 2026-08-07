/**
 * Ordering rules for how goals are presented to members.
 *
 * The primary fund is the one pot every monthly contribution flows into, so it
 * is the goal a member has actually put money into — it belongs at the top of
 * the list regardless of its deadline. Everything else keeps the order the
 * service returned it in (deadline, soonest first), which is what makes this a
 * stable partition rather than a sort.
 */
export function primaryFundFirst<T extends { isPrimary?: boolean }>(goals: readonly T[]): T[] {
  const primary = goals.filter((g) => g.isPrimary === true)
  const rest = goals.filter((g) => g.isPrimary !== true)
  return [...primary, ...rest]
}
