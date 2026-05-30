import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { LedgerEntryType } from '@/db/types'

export interface LedgerEntryWithInstrument {
  id?: number
  instrumentId: number
  instrumentName: string
  date: string
  type: LedgerEntryType
  amount: number
  notes?: string
  createdAt: string
}

export function useLedgerEntries(
  filter?: LedgerEntryType,
  search?: string,
): LedgerEntryWithInstrument[] {
  return useLiveQuery(
    async () => {
      const [entries, instruments] = await Promise.all([
        db.ledgerEntries.orderBy('date').reverse().toArray(),
        db.instruments.toArray(),
      ])

      const instrumentMap = new Map(instruments.map((i) => [i.id!, i.name]))

      let result: LedgerEntryWithInstrument[] = entries.map((entry) => ({
        ...entry,
        instrumentName: instrumentMap.get(entry.instrumentId) ?? '',
      }))

      if (filter) {
        result = result.filter((e) => e.type === filter)
      }

      if (search && search.trim() !== '') {
        const q = search.trim().toLowerCase()
        result = result.filter(
          (e) => e.instrumentName.toLowerCase().includes(q) || e.type.toLowerCase().includes(q),
        )
      }

      return result
    },
    [filter, search],
    [],
  )
}
