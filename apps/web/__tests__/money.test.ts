import { describe, it, expect } from 'vitest'
import { roundZAR, sumZAR, subtractZAR } from '@/lib/money'

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
})
