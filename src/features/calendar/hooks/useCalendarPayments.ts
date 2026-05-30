import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { PaymentRecord } from '@/db/types'

export interface CalendarPaymentEntry {
  payment: PaymentRecord
  instrumentName: string
}

export type DayPaymentsMap = Map<number, CalendarPaymentEntry[]>

function isoDateInRange(day: Date, fromISO: string, toISO: string): boolean {
  const from = new Date(fromISO + 'T00:00:00')
  const to = new Date(toISO + 'T00:00:00')
  return day >= from && day <= to
}

export function useCalendarPayments(year: number, month: number): DayPaymentsMap {
  return useLiveQuery(
    async () => {
      const [payments, instruments] = await Promise.all([
        db.paymentRecords.toArray(),
        db.instruments.toArray(),
      ])

      const instrumentNames = new Map<number, string>()
      for (const inst of instruments) {
        if (inst.id != null) instrumentNames.set(inst.id, inst.name)
      }

      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const map: DayPaymentsMap = new Map()

      for (let d = 1; d <= daysInMonth; d++) {
        // Build the date for this day (month is 0-indexed)
        const day = new Date(year, month, d)

        const entries: CalendarPaymentEntry[] = []
        for (const payment of payments) {
          if (isoDateInRange(day, payment.paymentDateFrom, payment.paymentDateTo)) {
            entries.push({
              payment,
              instrumentName:
                instrumentNames.get(payment.instrumentId) ?? `#${payment.instrumentId}`,
            })
          }
        }
        if (entries.length > 0) {
          map.set(d, entries)
        }
      }

      return map
    },
    [year, month],
    new Map(),
  )
}
