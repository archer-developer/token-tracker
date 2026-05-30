import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Instrument } from '@/db/types'

export function useInstruments(): Instrument[] {
  return useLiveQuery(() => db.instruments.orderBy('name').toArray(), [], [])
}

export function useInstrument(id: number | undefined): Instrument | null | undefined {
  return useLiveQuery(async () => (id != null ? db.instruments.get(id) : undefined), [id], null)
}
