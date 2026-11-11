import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Currency, PaymentRecord } from '@/db/types'

export interface CalendarPaymentEntry {
  payment: PaymentRecord
  instrumentName: string
  instrumentCurrency: Currency
}

export type DayPaymentsMap = Map<number, CalendarPaymentEntry[]>

// Paid payments are pinned to their actual payment date (paidAt);
// scheduled and missed payments appear on the first day of the window (paymentDateFrom).
function displayDateISO(payment: PaymentRecord): string {
  if (payment.status === 'paid' && payment.paidAt) {
    return payment.paidAt.slice(0, 10)
  }
  return payment.paymentDateFrom
}

export function useCalendarPayments(year: number, month: number): DayPaymentsMap {
  return useLiveQuery(
    async () => {
      const [payments, instruments] = await Promise.all([
        db.paymentRecords.toArray(),
        db.instruments.toArray(),
      ])

      const instrumentNames = new Map<number, string>()
      const instrumentCurrencies = new Map<number, Currency>()
      for (const inst of instruments) {
        if (inst.id != null) {
          instrumentNames.set(inst.id, inst.name)
          instrumentCurrencies.set(inst.id, inst.currency)
        }
      }

      // Month boundaries as ISO strings for fast comparison
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`

      const map: DayPaymentsMap = new Map()

      for (const payment of payments) {
        // Cancelled payments (e.g. coupons voided by early redemption) are kept in the DB but hidden.
        if (payment.status === 'cancelled') continue
        const dateISO = displayDateISO(payment)
        if (!dateISO.startsWith(monthStr)) continue

        const day = parseInt(dateISO.slice(8, 10), 10)
        const entry: CalendarPaymentEntry = {
          payment,
          instrumentName: instrumentNames.get(payment.instrumentId) ?? `#${payment.instrumentId}`,
          instrumentCurrency: instrumentCurrencies.get(payment.instrumentId) ?? 'BYN',
        }
        const existing = map.get(day)
        if (existing) {
          existing.push(entry)
        } else {
          map.set(day, [entry])
        }
      }

      return map
    },
    [year, month],
    new Map(),
  )
}
