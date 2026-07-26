import { describe, it, expect } from 'vitest'
import { SUCCESSFUL_INFLOW, SUCCESSFUL_INFLOW_SQL } from '@/repositories/transaction.repository'

/**
 * "What counts as money in" is now written twice: once as a Prisma filter, once
 * as SQL for the grouped drift query that Prisma's aggregation API cannot
 * express. Two definitions of the same rule is exactly the drift #214 had to go
 * and fix — a REVERSAL row is stored SUCCESS but is money going OUT, and every
 * sum that forgot to exclude it left the pool overstated.
 *
 * These assertions are deliberately literal. They fail the moment someone
 * changes one definition and not the other, which is the only thing standing
 * between the two now.
 */
describe('the inflow rule is the same in both spellings', () => {
  it('the Prisma filter is settled money that is not a reversal', () => {
    expect(SUCCESSFUL_INFLOW).toEqual({ status: 'SUCCESS', type: { not: 'REVERSAL' } })
  })

  it('the SQL says the same thing', () => {
    const sql = SUCCESSFUL_INFLOW_SQL.replace(/\s+/g, ' ').trim()
    expect(sql).toBe("t.status = 'SUCCESS' AND t.type <> 'REVERSAL'")
  })

  it('the SQL constrains both status and type, so neither half can be dropped', () => {
    expect(SUCCESSFUL_INFLOW_SQL).toContain('status')
    expect(SUCCESSFUL_INFLOW_SQL).toContain('type')
    expect(SUCCESSFUL_INFLOW_SQL).toContain('REVERSAL')
    expect(SUCCESSFUL_INFLOW_SQL).toContain('SUCCESS')
  })

  it('the SQL excludes reversals rather than including them', () => {
    // `<>` not `=`. A one-character slip here silently doubles the pool.
    expect(SUCCESSFUL_INFLOW_SQL).toMatch(/type\s*<>\s*'REVERSAL'/)
  })

  it('the SQL uses the alias the query provides', () => {
    expect(SUCCESSFUL_INFLOW_SQL).toMatch(/\bt\.status\b/)
    expect(SUCCESSFUL_INFLOW_SQL).toMatch(/\bt\.type\b/)
  })
})
