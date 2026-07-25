import { describe, it, expect } from 'vitest'
import { roundZAR, sumZAR, subtractZAR, percentZAR, splitZAR } from '@/lib/money'

describe('money helpers — deterministic 2-decimal rand arithmetic (B12)', () => {
  describe('roundZAR', () => {
    it('eliminates binary-float dust', () => {
      expect(roundZAR(0.1 + 0.2)).toBe(0.3) // 0.30000000000000004 → 0.3
      expect(roundZAR(1.005)).toBe(1.01) // half-up boundary
      expect(roundZAR(2.675)).toBe(2.68)
    })

    it('leaves clean 2-decimal values unchanged', () => {
      expect(roundZAR(500)).toBe(500)
      expect(roundZAR(1234.56)).toBe(1234.56)
      expect(roundZAR(0)).toBe(0)
    })
  })

  describe('sumZAR', () => {
    it('adds amounts and rounds the result', () => {
      expect(sumZAR(0.1, 0.2)).toBe(0.3)
      expect(sumZAR(100.1, 200.2, 50.05)).toBe(350.35)
    })

    it('returns 0 for no arguments', () => {
      expect(sumZAR()).toBe(0)
    })
  })

  describe('subtractZAR', () => {
    it('subtracts and rounds', () => {
      expect(subtractZAR(0.3, 0.1)).toBe(0.2) // 0.19999999999999998 → 0.2
      expect(subtractZAR(500, 149.99)).toBe(350.01)
    })

    it('never returns negative zero', () => {
      expect(Object.is(subtractZAR(5, 5), 0)).toBe(true)
      expect(Object.is(subtractZAR(5, 5), -0)).toBe(false)
    })

    it('can go negative (overpayment / over-budget)', () => {
      expect(subtractZAR(100, 150.5)).toBe(-50.5)
    })
  })

  describe('percentZAR', () => {
    it('computes a percentage of an amount, rounded to the cent', () => {
      expect(percentZAR(200, 7.5)).toBe(15) // 7.5% of R200
      expect(percentZAR(100, 10)).toBe(10)
      expect(percentZAR(199.99, 15)).toBe(30) // 29.9985 → 30.00
      expect(percentZAR(33.33, 10)).toBe(3.33)
    })

    it('handles zero and negative amounts', () => {
      expect(percentZAR(0, 5)).toBe(0)
      expect(percentZAR(100, 0)).toBe(0)
      expect(percentZAR(-100, 10)).toBe(-10)
    })
  })

  describe('splitZAR — penny-perfect equal split', () => {
    it('never loses or invents a cent (R100 / 3)', () => {
      const shares = splitZAR(100, 3)
      expect(shares).toEqual([33.34, 33.33, 33.33])
      expect(sumZAR(...shares)).toBe(100)
    })

    it('splits evenly when it divides cleanly', () => {
      expect(splitZAR(10, 4)).toEqual([2.5, 2.5, 2.5, 2.5])
      expect(splitZAR(100, 1)).toEqual([100])
    })

    it('handles sub-rand amounts (R0.10 / 3)', () => {
      const shares = splitZAR(0.1, 3)
      expect(shares).toEqual([0.04, 0.03, 0.03])
      expect(sumZAR(...shares)).toBe(0.1)
    })

    it('conserves the total for a negative amount (reversal)', () => {
      const shares = splitZAR(-100, 3)
      expect(sumZAR(...shares)).toBe(-100)
    })

    it('holds the invariants across many amounts and part counts', () => {
      const cases: Array<[number, number]> = [
        [100, 3], [0.05, 4], [999.99, 7], [1, 3], [50, 6], [1234.56, 11], [0.01, 2], [7.77, 5],
      ]
      for (const [amount, parts] of cases) {
        const shares = splitZAR(amount, parts)
        expect(shares).toHaveLength(parts)
        // Sums back exactly.
        expect(sumZAR(...shares)).toBe(roundZAR(amount))
        // Any two shares differ by at most one cent.
        const spread = Math.max(...shares) - Math.min(...shares)
        expect(roundZAR(spread)).toBeLessThanOrEqual(0.01)
      }
    })

    it('rejects a non-positive or non-integer part count', () => {
      expect(() => splitZAR(100, 0)).toThrow()
      expect(() => splitZAR(100, -3)).toThrow()
      expect(() => splitZAR(100, 2.5)).toThrow()
    })
  })
})
