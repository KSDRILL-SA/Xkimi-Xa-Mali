import { describe, it, expect } from 'vitest'
import { roundZAR, sumZAR, subtractZAR, percentZAR, splitZAR, splitByWeightsZAR } from '@/lib/money'

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

  describe('splitByWeightsZAR — penny-perfect proportional split', () => {
    it('matches splitZAR for equal weights', () => {
      const shares = splitByWeightsZAR(100, [1, 1, 1])
      expect(shares).toEqual([33.34, 33.33, 33.33])
      expect(sumZAR(...shares)).toBe(100)
    })

    it('apportions by weight and sums back exactly', () => {
      expect(splitByWeightsZAR(100, [50, 30, 20])).toEqual([50, 30, 20])
      expect(splitByWeightsZAR(100, [1, 2, 1])).toEqual([25, 50, 25])
      const s = splitByWeightsZAR(10, [1, 1, 1])
      expect(s).toEqual([3.34, 3.33, 3.33])
      expect(sumZAR(...s)).toBe(10)
    })

    it('gives a zero-weight recipient exactly R0', () => {
      const shares = splitByWeightsZAR(100, [1, 0, 1])
      expect(shares).toEqual([50, 0, 50])
      expect(sumZAR(...shares)).toBe(100)
    })

    it('splits equally when every weight is zero (cents still conserved)', () => {
      const shares = splitByWeightsZAR(90, [0, 0, 0])
      expect(sumZAR(...shares)).toBe(90)
      expect(shares).toEqual([30, 30, 30])
    })

    it('conserves the total for a negative amount (reversing a distribution)', () => {
      expect(sumZAR(...splitByWeightsZAR(-100, [50, 30, 20]))).toBe(-100)
      expect(sumZAR(...splitByWeightsZAR(-100, [1, 1, 1]))).toBe(-100)
    })

    it('holds the invariants across many amounts and weightings', () => {
      const cases: Array<[number, number[]]> = [
        [100, [1, 1, 1]],
        [999.99, [3, 5, 7, 11]],
        [1, [1, 1, 1]],
        [1234.56, [10, 20, 30, 40]],
        [0.05, [1, 1]],
        [5000, [17, 3, 80]],
        [250.25, [1, 0, 2, 0, 3]],
      ]
      for (const [amount, weights] of cases) {
        const shares = splitByWeightsZAR(amount, weights)
        expect(shares).toHaveLength(weights.length)
        // Sums back exactly.
        expect(sumZAR(...shares)).toBe(roundZAR(amount))
        // Monotonic: a larger weight never gets a smaller share.
        for (let i = 0; i < weights.length; i++) {
          for (let j = 0; j < weights.length; j++) {
            if (weights[i]! > weights[j]!) {
              expect(shares[i]!).toBeGreaterThanOrEqual(shares[j]!)
            }
          }
        }
      }
    })

    it('rejects empty or invalid weights', () => {
      expect(() => splitByWeightsZAR(100, [])).toThrow()
      expect(() => splitByWeightsZAR(100, [1, -1])).toThrow()
      expect(() => splitByWeightsZAR(100, [1, NaN])).toThrow()
    })
  })
})
