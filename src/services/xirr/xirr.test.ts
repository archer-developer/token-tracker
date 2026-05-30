import { describe, it, expect } from 'vitest'
import { xirr } from './xirr'

describe('xirr', () => {
  it('returns null for fewer than 2 cash flows', () => {
    expect(xirr([{ date: new Date('2024-01-01'), amount: -1000 }])).toBeNull()
  })

  it('returns null when all flows are negative', () => {
    expect(
      xirr([
        { date: new Date('2024-01-01'), amount: -1000 },
        { date: new Date('2025-01-01'), amount: -500 },
      ]),
    ).toBeNull()
  })

  it('calculates ~10% annual return for a simple 1-year bond', () => {
    const result = xirr([
      { date: new Date('2024-01-01'), amount: -1000 },
      { date: new Date('2025-01-01'), amount: 1100 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeCloseTo(0.1, 2)
  })

  it('handles monthly coupon payments correctly', () => {
    const flows = [{ date: new Date('2024-01-01'), amount: -1200 }]
    for (let m = 1; m <= 12; m++) {
      flows.push({ date: new Date(`2024-${String(m).padStart(2, '0')}-15`), amount: 10 })
    }
    flows.push({ date: new Date('2025-01-01'), amount: 1200 })
    const result = xirr(flows)
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(0.08)
    expect(result!).toBeLessThan(0.12)
  })

  it('returns negative XIRR for a loss scenario', () => {
    const result = xirr([
      { date: new Date('2024-01-01'), amount: -1000 },
      { date: new Date('2025-01-01'), amount: 800 },
    ])
    expect(result).not.toBeNull()
    expect(result!).toBeLessThan(0)
  })
})
