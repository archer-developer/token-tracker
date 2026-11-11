import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/db/db'
import type { Instrument, PaymentRecord } from '@/db/types'
import { getMaturedPreview, markInstrumentMatured } from './markMatured'
import { regenerateSchedule } from '@/features/payments/scheduleUtils'

// HELIEUR28 (Hello carsharing, Bynex) — redeemed early on 06.11.2026 instead of 25.08.2028.
// Portal transaction history: coupon 70.32 EUR on 10.11.2026, principal 9000 EUR on 06.11.2026.
const INSTRUMENT: Instrument = {
  id: 12,
  name: 'HELIEUR28',
  platform: 'Bynex',
  currency: 'EUR',
  couponRate: 9.2,
  tokenPrice: 50,
  startDate: '2025-05-24',
  endDate: '2028-08-25',
  paymentFrequency: 'monthly',
  paymentDayFrom: 10,
  paymentDayTo: 10,
  status: 'active',
  createdAt: '2026-05-31T16:13:47.650Z',
  updatedAt: '2026-05-31T16:13:47.650Z',
}

function coupon(
  periodIndex: number,
  date: string,
  expectedAmount: number,
  status: PaymentRecord['status'] = 'scheduled',
): PaymentRecord {
  return {
    instrumentId: 12,
    periodIndex,
    type: 'coupon',
    paymentDateFrom: date,
    paymentDateTo: date,
    expectedAmount,
    status,
    ...(status === 'paid' ? { actualAmount: expectedAmount, paidAt: date } : {}),
  }
}

const PAYMENTS: PaymentRecord[] = [
  coupon(6, '2025-12-10', 0),
  coupon(16, '2026-10-10', 68.05, 'paid'),
  coupon(17, '2026-11-10', 70.32, 'paid'),
  coupon(18, '2026-12-10', 68.05),
  coupon(19, '2027-01-10', 70.32),
  coupon(39, '2028-08-10', 56.56),
  coupon(40, '2028-09-10', 0),
  {
    instrumentId: 12,
    periodIndex: 39.5,
    type: 'redemption',
    paymentDateFrom: '2028-08-25',
    paymentDateTo: '2028-08-25',
    expectedAmount: 9000,
    status: 'scheduled',
  },
]

async function seed(payments: PaymentRecord[] = PAYMENTS) {
  await db.instruments.clear()
  await db.paymentRecords.clear()
  await db.ledgerEntries.clear()
  await db.purchaseLots.clear()
  await db.instruments.add(INSTRUMENT)
  await db.paymentRecords.bulkAdd(payments)
}

async function byKey() {
  const records = await db.paymentRecords.where('instrumentId').equals(12).toArray()
  return new Map(records.map((r) => [`${r.periodIndex}:${r.type}`, r]))
}

describe('markInstrumentMatured', () => {
  beforeEach(() => seed())

  it('preview separates redemption from non-zero scheduled coupons', async () => {
    const { redemptions, coupons } = await getMaturedPreview(12)
    expect(redemptions.map((p) => p.expectedAmount)).toEqual([9000])
    expect(coupons.map((p) => p.expectedAmount).sort()).toEqual([56.56, 68.05, 70.32])
  })

  it('early redemption: principal paid on actual date, future coupons cancelled', async () => {
    await markInstrumentMatured(12, { redemptionDate: '2026-11-06', markCouponsPaid: false })

    const inst = await db.instruments.get(12)
    expect(inst?.status).toBe('matured')
    expect(inst?.redemptionDate).toBe('2026-11-06')

    const records = await byKey()
    const redemption = records.get('39.5:redemption')!
    expect(redemption.status).toBe('paid')
    expect(redemption.paidAt).toBe('2026-11-06')
    expect(redemption.actualAmount).toBe(9000)

    expect(records.get('18:coupon')!.status).toBe('cancelled')
    expect(records.get('19:coupon')!.status).toBe('cancelled')
    expect(records.get('39:coupon')!.status).toBe('cancelled')
    expect(records.get('18:coupon')!.actualAmount).toBeUndefined()
    // zero-amount coupons: cancelled only after the redemption date; paid ones untouched
    expect(records.get('40:coupon')!.status).toBe('cancelled')
    expect(records.get('6:coupon')!.status).toBe('scheduled')
    expect(records.get('17:coupon')!.status).toBe('paid')
    expect(records.get('17:coupon')!.paidAt).toBe('2026-11-10')

    const ledger = await db.ledgerEntries.toArray()
    expect(ledger).toHaveLength(1)
    expect(ledger[0]).toMatchObject({ type: 'redemption', date: '2026-11-06', amount: 9000 })
  })

  it('regular maturity: coupons paid on their scheduled dates, principal on redemption date', async () => {
    await markInstrumentMatured(12, { redemptionDate: '2028-08-25', markCouponsPaid: true })

    const records = await byKey()
    expect(records.get('18:coupon')!).toMatchObject({ status: 'paid', paidAt: '2026-12-10' })
    expect(records.get('39:coupon')!).toMatchObject({ status: 'paid', paidAt: '2028-08-10' })
    expect(records.get('39.5:redemption')!).toMatchObject({ status: 'paid', paidAt: '2028-08-25' })
    // zero-amount coupon is not touched in this mode (no ledger noise)
    expect(records.get('6:coupon')!.status).toBe('scheduled')

    const ledger = await db.ledgerEntries.orderBy('date').toArray()
    expect(ledger.map((e) => [e.type, e.date, e.amount])).toEqual([
      ['coupon', '2026-12-10', 68.05],
      ['coupon', '2027-01-10', 70.32],
      ['coupon', '2028-08-10', 56.56],
      ['redemption', '2028-08-25', 9000],
    ])
  })

  it('cancelled records survive schedule regeneration', async () => {
    await db.purchaseLots.add({
      instrumentId: 12,
      purchaseDate: '2025-12-23',
      quantity: 180,
      pricePerToken: 50,
      totalCost: 9000,
      createdAt: '2025-12-23T00:00:00.000Z',
    })
    await markInstrumentMatured(12, { redemptionDate: '2026-11-06', markCouponsPaid: false })
    const inst = await db.instruments.get(12)
    await regenerateSchedule(inst!)

    const records = await byKey()
    expect(records.get('18:coupon')!.status).toBe('cancelled')
    expect(records.get('39:coupon')!.status).toBe('cancelled')
    expect(records.get('39.5:redemption')!.status).toBe('paid')
  })
})
