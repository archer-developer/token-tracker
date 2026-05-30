import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { PaymentRecord } from '@/db/types'

export function usePayments(instrumentId: number): PaymentRecord[] {
  return useLiveQuery(
    () => db.paymentRecords.where('instrumentId').equals(instrumentId).sortBy('paymentDateFrom'),
    [instrumentId],
    [],
  )
}
