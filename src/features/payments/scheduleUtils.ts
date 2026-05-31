import { db } from '@/db/db'
import type { Instrument } from '@/db/types'
import { generateSchedule } from './generateSchedule'

export async function regenerateSchedule(instrument: Instrument): Promise<void> {
  if (!instrument.id) return

  const lots = await db.purchaseLots.where('instrumentId').equals(instrument.id).toArray()

  const newRecords = generateSchedule(instrument, lots)

  const existingRecords = await db.paymentRecords
    .where('instrumentId')
    .equals(instrument.id)
    .toArray()

  const preservedMap = new Map(
    existingRecords
      .filter((r) => r.status === 'paid' || r.status === 'missed')
      .map((r) => [`${r.periodIndex}:${r.type}`, r]),
  )

  await db.transaction('rw', db.paymentRecords, async () => {
    await db.paymentRecords.where('instrumentId').equals(instrument.id!).delete()

    for (const record of newRecords) {
      const key = `${record.periodIndex}:${record.type}`
      const preserved = preservedMap.get(key)
      if (preserved) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: _id, ...rest } = preserved
        await db.paymentRecords.add({ ...rest, expectedAmount: record.expectedAmount })
      } else {
        await db.paymentRecords.add(record)
      }
    }
  })
}
