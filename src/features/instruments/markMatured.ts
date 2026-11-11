import { db } from '@/db/db'
import type { PaymentRecord } from '@/db/types'

export interface MarkMaturedOptions {
  /** Actual date the issuer returned the principal (ISO yyyy-mm-dd). */
  redemptionDate: string
  /**
   * true  — remaining scheduled coupons are marked as paid on their scheduled dates (regular maturity).
   * false — remaining scheduled coupons are marked as cancelled (early redemption: no more interest).
   */
  markCouponsPaid: boolean
}

export interface MaturedPreview {
  redemptions: PaymentRecord[]
  coupons: PaymentRecord[]
}

/** Scheduled non-zero payments that will be affected by marking the instrument as matured. */
export async function getMaturedPreview(instrumentId: number): Promise<MaturedPreview> {
  const scheduled = await db.paymentRecords
    .where('instrumentId')
    .equals(instrumentId)
    .filter((p) => p.status === 'scheduled' && p.expectedAmount > 0)
    .toArray()
  return {
    redemptions: scheduled.filter((p) => p.type === 'redemption'),
    coupons: scheduled.filter((p) => p.type !== 'redemption'),
  }
}

/**
 * Marks the instrument as matured.
 * Redemption (principal) is always recorded as paid on `redemptionDate`.
 * Remaining coupons are either paid on their scheduled dates or cancelled (kept in DB, hidden in calendar).
 */
export async function markInstrumentMatured(
  instrumentId: number,
  { redemptionDate, markCouponsPaid }: MarkMaturedOptions,
): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', [db.instruments, db.paymentRecords, db.ledgerEntries], async () => {
    const { redemptions, coupons } = await getMaturedPreview(instrumentId)

    await db.instruments.update(instrumentId, {
      status: 'matured',
      redemptionDate,
      updatedAt: now,
    })

    for (const p of redemptions) {
      await markPaid(p, redemptionDate, now)
    }

    for (const p of coupons) {
      if (markCouponsPaid) {
        await markPaid(p, p.paymentDateFrom, now)
      } else if (p.id != null) {
        await db.paymentRecords.update(p.id, { status: 'cancelled' })
      }
    }

    if (!markCouponsPaid) {
      // Zero-amount coupons after the redemption date are void too — cancel them so they never
      // resurface (e.g. with "show zero payments" on). Earlier zero periods are left as they were.
      await db.paymentRecords
        .where('instrumentId')
        .equals(instrumentId)
        .filter(
          (p) =>
            p.status === 'scheduled' && p.type === 'coupon' && p.paymentDateFrom > redemptionDate,
        )
        .modify({ status: 'cancelled' })
    }
  })
}

async function markPaid(p: PaymentRecord, paidAt: string, now: string): Promise<void> {
  if (p.id == null) return
  await db.paymentRecords.update(p.id, {
    status: 'paid',
    actualAmount: p.expectedAmount,
    paidAt,
  })
  await db.ledgerEntries.add({
    instrumentId: p.instrumentId,
    date: paidAt,
    type: p.type,
    amount: p.expectedAmount,
    createdAt: now,
  })
}
