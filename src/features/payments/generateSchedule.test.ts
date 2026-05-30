import { describe, it, expect } from 'vitest'
import { generateSchedule } from './generateSchedule'
import type { Instrument } from '@/db/types'

// Generic 1-year monthly bond (endDate = last day of accrual, not maturity+1)
const base: Instrument = {
  id: 1,
  name: 'Test Bond',
  platform: 'Finstore',
  currency: 'BYN',
  couponRate: 20,
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  paymentFrequency: 'monthly',
  paymentDayFrom: 10,
  paymentDayTo: 15,
  status: 'active',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const PRINCIPAL = 1200

describe('generateSchedule — structure', () => {
  it('generates 12 coupon records + 1 redemption for a 1-year monthly bond', () => {
    const records = generateSchedule(base, PRINCIPAL)
    expect(records.filter((r) => r.type === 'coupon')).toHaveLength(12)
    expect(records.filter((r) => r.type === 'redemption')).toHaveLength(1)
  })

  it('redemption amount equals the principal', () => {
    const records = generateSchedule(base, PRINCIPAL)
    const redemption = records.find((r) => r.type === 'redemption')
    expect(redemption?.expectedAmount).toBe(PRINCIPAL)
  })

  it('redemption date matches the endDate', () => {
    const records = generateSchedule(base, PRINCIPAL)
    const redemption = records.find((r) => r.type === 'redemption')
    expect(redemption?.paymentDateFrom).toBe('2024-12-31')
  })

  it('payment windows use the configured day range', () => {
    const records = generateSchedule(base, PRINCIPAL)
    const coupon = records.find((r) => r.type === 'coupon')
    expect(coupon?.paymentDateFrom).toMatch(/-10$/)
    expect(coupon?.paymentDateTo).toMatch(/-15$/)
  })

  it('generates 4 coupon records for a 1-year quarterly bond', () => {
    const records = generateSchedule({ ...base, paymentFrequency: 'quarterly' }, PRINCIPAL)
    expect(records.filter((r) => r.type === 'coupon')).toHaveLength(4)
  })

  it('returns empty array when instrument has no id', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _, ...noId } = base
    expect(generateSchedule(noId as Instrument, PRINCIPAL)).toHaveLength(0)
  })

  it('all records start as scheduled', () => {
    const records = generateSchedule(base, PRINCIPAL)
    records.forEach((r) => expect(r.status).toBe('scheduled'))
  })

  it('generates zero-amount coupon records when principal is 0', () => {
    const records = generateSchedule(base, 0)
    records.filter((r) => r.type === 'coupon').forEach((r) => expect(r.expectedAmount).toBe(0))
  })
})

describe('generateSchedule — correct day-count formula', () => {
  it('January 2024 coupon uses actual days (31) and leap year (366)', () => {
    const records = generateSchedule(base, PRINCIPAL)
    const jan = records.find((r) => r.type === 'coupon' && r.paymentDateFrom === '2024-02-10')
    // 1200 × 0.20 × 31 / 366 = 20.327... → 20.33
    expect(jan?.expectedAmount).toBe(20.33)
  })

  it('February 2024 coupon uses 29 days (leap year)', () => {
    const records = generateSchedule(base, PRINCIPAL)
    const feb = records.find((r) => r.type === 'coupon' && r.paymentDateFrom === '2024-03-10')
    // 1200 × 0.20 × 29 / 366 = 19.016... → 19.02
    expect(feb?.expectedAmount).toBe(19.02)
  })
})

// ---------------------------------------------------------------------------
// GURMINA.USD.2024.01 — real instrument, real payments
// Source: docs/examples/gurnima-algorithm.md
// ---------------------------------------------------------------------------

const gurmina: Instrument = {
  id: 1,
  name: 'GURMINA.USD.2024.01',
  platform: 'Fainex',
  currency: 'USD',
  couponRate: 11,
  startDate: '2024-12-30',
  endDate: '2026-12-14',
  paymentFrequency: 'monthly',
  paymentDayFrom: 15,
  paymentDayTo: 18,
  status: 'active',
  createdAt: '2024-12-30T00:00:00.000Z',
  updatedAt: '2024-12-30T00:00:00.000Z',
}

describe('generateSchedule — GURMINA.USD.2024.01 real payments', () => {
  it('generates 25 coupon periods + 1 redemption', () => {
    const records = generateSchedule(gurmina, 10040)
    expect(records.filter((r) => r.type === 'coupon')).toHaveLength(25)
    expect(records.filter((r) => r.type === 'redemption')).toHaveLength(1)
  })

  it('first period (30.12–31.12.2024) is 2 days and pays in January 2025', () => {
    const records = generateSchedule(gurmina, 10040)
    const first = records.find((r) => r.type === 'coupon' && r.paymentDateFrom === '2025-01-15')
    expect(first).toBeDefined()
    // 10040 × 0.11 × 2 / 366 = 6.034... → 6.03
    expect(first?.expectedAmount).toBe(6.03)
  })

  it('last period (01.12–14.12.2026) pays in the same December', () => {
    const records = generateSchedule(gurmina, 10040)
    const last = records.filter((r) => r.type === 'coupon').at(-1)
    expect(last?.paymentDateFrom).toBe('2026-12-15')
    // 10040 × 0.11 × 14 / 365 = 42.360... → 42.36
    expect(last?.expectedAmount).toBe(42.36)
  })

  // --- payments verified against actual platform data ---

  it('15.02.2025 — January 2025 (31 days, 365-day year) = 47.25 USD', () => {
    // Principal 5 058 USD = first purchase lot in DB (before top-up)
    // Verification: 5058 × 0.11 × 31 / 365 = 47.254... → 47.25
    const records = generateSchedule(gurmina, 5058)
    const payment = records.find((r) => r.type === 'coupon' && r.paymentDateFrom === '2025-02-15')
    expect(payment?.expectedAmount).toBe(47.25)
  })

  it('15.03.2026 — February 2026 (28 days, 365-day year) = 84.72 USD', () => {
    // Principal 10 040 USD = 502 tokens × 20 USD (current total in DB)
    // Verification: 10040 × 0.11 × 28 / 365 = 84.721... → 84.72
    const records = generateSchedule(gurmina, 10040)
    const payment = records.find((r) => r.type === 'coupon' && r.paymentDateFrom === '2026-03-15')
    expect(payment?.expectedAmount).toBe(84.72)
  })

  it('15.04.2026 — March 2026 (31 days, 365-day year) = 93.80 USD', () => {
    // Verification: 10040 × 0.11 × 31 / 365 = 93.798... → 93.80
    const records = generateSchedule(gurmina, 10040)
    const payment = records.find((r) => r.type === 'coupon' && r.paymentDateFrom === '2026-04-15')
    expect(payment?.expectedAmount).toBe(93.8)
  })

  it('15.05.2026 — April 2026 (30 days, 365-day year) = 90.77 USD', () => {
    // Verification: 10040 × 0.11 × 30 / 365 = 90.772... → 90.77
    const records = generateSchedule(gurmina, 10040)
    const payment = records.find((r) => r.type === 'coupon' && r.paymentDateFrom === '2026-05-15')
    expect(payment?.expectedAmount).toBe(90.77)
  })
})
