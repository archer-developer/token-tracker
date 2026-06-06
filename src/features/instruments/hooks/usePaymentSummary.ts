import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'

export interface PaymentSummary {
  totalPaid: number
  totalRemaining: number
}

export function usePaymentSummary(instrumentId: number): PaymentSummary {
  const payments = useLiveQuery(
    () => db.paymentRecords.where('instrumentId').equals(instrumentId).toArray(),
    [instrumentId],
    [],
  )

  const totalPaid = payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (p.actualAmount ?? p.expectedAmount), 0)

  const totalRemaining = payments
    .filter((p) => p.status === 'scheduled')
    .reduce((sum, p) => sum + p.expectedAmount, 0)

  return { totalPaid, totalRemaining }
}
