import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { LedgerEntryType, Currency } from '@/db/types'

export interface LedgerEntryWithInstrument {
  id?: number
  instrumentId: number
  instrumentName: string
  instrumentCurrency: Currency
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

      const instrumentMap = new Map(
        instruments.map((i) => [i.id!, { name: i.name, currency: i.currency }]),
      )

      let result: LedgerEntryWithInstrument[] = entries.map((entry) => {
        const instrument = instrumentMap.get(entry.instrumentId)
        const mappedEntry = {
          ...entry,
          instrumentName: instrument?.name ?? '',
          instrumentCurrency: instrument?.currency ?? 'BYN',
        }
        return mappedEntry
      })

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
