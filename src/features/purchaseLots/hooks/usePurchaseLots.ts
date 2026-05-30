import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { PurchaseLot } from '@/db/types'

export function usePurchaseLots(instrumentId: number): PurchaseLot[] {
  return useLiveQuery(
    () => db.purchaseLots.where('instrumentId').equals(instrumentId).sortBy('purchaseDate'),
    [instrumentId],
    [],
  )
}
