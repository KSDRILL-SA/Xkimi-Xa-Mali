import { describe, it, expect } from 'vitest'
import { primaryFundFirst } from '@/lib/goal-order'

const goal = (id: string, isPrimary?: boolean) => ({ id, ...(isPrimary !== undefined && { isPrimary }) })

describe('primaryFundFirst', () => {
  it('lifts the primary fund to the front', () => {
    const ordered = primaryFundFirst([goal('a'), goal('b', true), goal('c')])
    expect(ordered.map((g) => g.id)).toEqual(['b', 'a', 'c'])
  })

  it('preserves the deadline order the service returned for everything else', () => {
    const ordered = primaryFundFirst([goal('a'), goal('b'), goal('c', true), goal('d')])
    expect(ordered.map((g) => g.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('leaves a list with no primary fund untouched', () => {
    const ordered = primaryFundFirst([goal('a'), goal('b', false), goal('c')])
    expect(ordered.map((g) => g.id)).toEqual(['a', 'b', 'c'])
  })

  it('treats a missing isPrimary field as not primary', () => {
    const ordered = primaryFundFirst([goal('a'), goal('b')])
    expect(ordered.map((g) => g.id)).toEqual(['a', 'b'])
  })

  it('handles an empty list', () => {
    expect(primaryFundFirst([])).toEqual([])
  })

  it('does not mutate the input', () => {
    const input = [goal('a'), goal('b', true)]
    primaryFundFirst(input)
    expect(input.map((g) => g.id)).toEqual(['a', 'b'])
  })
})
