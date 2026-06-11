/**
 * Normalises a Prisma `groupBy` result into a `{ key: count }` map.
 *
 * Handles both shapes Prisma can return:
 *   - `_count: true`            → a plain number
 *   - `_count: { field: true }` → an object, read via `field`
 *
 * Replaces the fragile, copy-pasted `Object.fromEntries(rows.map(...))` blocks
 * that previously lived in several services.
 */
export function tallyBy<T extends { _count: unknown }>(
  rows: readonly T[],
  getKey: (row: T) => string,
  field?: string,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of rows) {
    const c = row._count
    out[getKey(row)] =
      typeof c === 'number'
        ? c
        : field && typeof c === 'object' && c !== null && field in c
          ? Number((c as Record<string, number>)[field])
          : 0
  }
  return out
}
